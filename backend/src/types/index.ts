import { Request } from 'express';

// ──────────────────────────────────────────────
// Auth
// ──────────────────────────────────────────────
export interface AuthUser {
  userId: string;
  email: string;
}

export interface AuthRequest extends Request {
  user?: AuthUser;
}

// ──────────────────────────────────────────────
// DB Row types
// ──────────────────────────────────────────────
export interface UserRow {
  id: string;
  email: string;
  display_name: string;
  created_at: Date;
  last_login_at: Date;
}

export interface DeviceRow {
  id: string;
  user_id: string;
  platform: 'ios';
  push_token: string;
  created_at: Date;
  last_seen_at: Date;
}

export type RelationshipStatus = 'active' | 'blocked';

export interface RelationshipRow {
  id: string;
  owner_user_id: string;
  controller_user_id: string;
  status: RelationshipStatus;
  created_at: Date;
  blocked_at: Date | null;
  blocked_by_user_id: string | null;
}

export type InviteStatus = 'pending' | 'accepted' | 'expired' | 'revoked';

export interface InviteRow {
  id: string;
  owner_user_id: string;
  invitee_email: string;
  token: string;
  status: InviteStatus;
  expires_at: Date;
  created_at: Date;
  accepted_at: Date | null;
}

export type TaskStatus =
  | 'scheduled'
  | 'readyToZap'
  | 'waitingAck'
  | 'readyToReZap'
  | 'closed';

export interface TaskRow {
  id: string;
  owner_user_id: string;
  title: string;
  due_at: Date;
  created_at: Date;
  closed_at: Date | null;
  status: TaskStatus;
}

export type ZapRequestStatus =
  | 'created'
  | 'executed'
  | 'not_started'
  | 'acknowledged'
  | 'expired';

export type ZapErrorCode =
  | 'BLE_NOT_CONNECTED'
  | 'BLE_TIMEOUT'
  | 'PUSH_NOT_DELIVERED'
  | 'DEVICE_OFFLINE'
  | 'UNKNOWN';

export interface ZapRequestRow {
  id: string;
  task_id: string;
  owner_user_id: string;
  controller_user_id: string;
  created_at: Date;
  ack_deadline_at: Date;
  status: ZapRequestStatus;
  attempted_zaps: number;
  succeeded_zaps: number;
  last_error_code: ZapErrorCode | null;
  last_error_message: string | null;
}

export interface AckEventRow {
  id: string;
  zap_request_id: string;
  owner_user_id: string;
  created_at: Date;
}
