import { Credential } from 'firebase-admin/app';
import { Message } from 'firebase-admin/messaging';

let _credential: Credential | null = null;
let _projectId: string | null = null;

export function initFCM(credential: Credential, projectId: string): void {
  _credential = credential;
  _projectId = projectId;
}

export async function sendMessage(message: Message): Promise<void> {
  if (!_credential || !_projectId) {
    throw new Error('FCM not initialized');
  }
  const tokenResult = await _credential.getAccessToken();
  console.log(`[FCM] sendMessage projectId=${_projectId} token_prefix=${tokenResult.access_token?.substring(0, 20)}`);
  const resp = await fetch(
    `https://fcm.googleapis.com/v1/projects/${_projectId}/messages:send`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tokenResult.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ message }),
    }
  );
  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`FCM send failed ${resp.status}: ${body}`);
  }
}
