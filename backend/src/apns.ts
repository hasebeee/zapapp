import * as http2 from 'http2';
import * as crypto from 'crypto';

const APNS_HOST_PROD = 'api.push.apple.com';
const APNS_HOST_SANDBOX = 'api.sandbox.push.apple.com';

let _privateKey: string | null = null;
let _keyId: string | null = null;
let _teamId: string | null = null;
let _bundleId: string | null = null;

export function initAPNs(privateKey: string, keyId: string, teamId: string, bundleId: string): void {
  _privateKey = privateKey;
  _keyId = keyId;
  _teamId = teamId;
  _bundleId = bundleId;
}

function generateJWT(): string {
  if (!_privateKey || !_keyId || !_teamId) throw new Error('APNs not initialized');

  const header = Buffer.from(JSON.stringify({ alg: 'ES256', kid: _keyId })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    iss: _teamId,
    iat: Math.floor(Date.now() / 1000),
  })).toString('base64url');

  const unsigned = `${header}.${payload}`;
  const sign = crypto.createSign('SHA256');
  sign.update(unsigned);
  const signature = sign.sign({ key: _privateKey, dsaEncoding: 'ieee-p1363' }).toString('base64url');

  return `${unsigned}.${signature}`;
}

export interface APNsMessage {
  token: string;
  environment: 'production' | 'sandbox';
  notification: { title: string; body: string };
  data?: Record<string, unknown>;
  contentAvailable?: boolean;
}

export async function sendAPNs(message: APNsMessage): Promise<void> {
  if (!_bundleId) throw new Error('APNs not initialized');

  const host = message.environment === 'sandbox' ? APNS_HOST_SANDBOX : APNS_HOST_PROD;
  const jwt = generateJWT();

  const aps: Record<string, unknown> = {
    alert: {
      title: message.notification.title,
      body: message.notification.body,
    },
    sound: 'default',
    badge: 1,
  };
  if (message.contentAvailable) {
    aps['content-available'] = 1;
  }

  const body = JSON.stringify({ aps, ...message.data });

  console.log(`[APNs] sendAPNs env=${message.environment} host=${host} token=${message.token.substring(0, 8)}...`);

  return new Promise((resolve, reject) => {
    const session = http2.connect(`https://${host}`);

    session.on('error', (err) => {
      session.destroy();
      reject(err);
    });

    const req = session.request({
      ':method': 'POST',
      ':path': `/3/device/${message.token}`,
      'authorization': `bearer ${jwt}`,
      'apns-push-type': 'alert',
      'apns-priority': '10',
      'apns-topic': _bundleId!,
      'content-type': 'application/json',
      'content-length': Buffer.byteLength(body),
    });

    req.write(body);
    req.end();

    let status: number | undefined;
    let responseData = '';

    req.on('response', (headers) => {
      status = headers[':status'] as number;
    });

    req.on('data', (chunk) => {
      responseData += chunk;
    });

    req.on('end', () => {
      session.destroy();
      if (status === 200) {
        resolve();
      } else {
        reject(new Error(`APNs send failed ${status}: ${responseData}`));
      }
    });

    req.on('error', (err) => {
      session.destroy();
      reject(err);
    });
  });
}
