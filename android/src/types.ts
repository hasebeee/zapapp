// バックエンドが返す JSON の形（snake_case）をそのまま型として定義する。

export type TaskStatus = 'scheduled' | 'readyToZap' | 'waitingAck' | 'readyToReZap' | 'closed';

export const taskStatusLabel: Record<TaskStatus, string> = {
  scheduled: 'Zap判定前',
  readyToZap: '監視者のZap判定待ち',
  waitingAck: '未報告',
  readyToReZap: 'Zap報告がなかったため再Zap可能',
  closed: '完了',
};

export interface AppTask {
  id: string;
  owner_user_id: string;
  controller_user_id: string | null;
  title: string;
  zap_criteria: string | null;
  due_at: string;
  created_at: string;
  closed_at: string | null;
  status: TaskStatus;
  reminder_minutes: number;
}

export interface AppUser {
  id: string;
  email: string;
  display_name: string | null;
  created_at: string;
  pavlok_connected: boolean;
}

export interface RelationshipUser {
  id: string;
  email: string;
  display_name: string | null;
}

export interface Relationship {
  id: string;
  owner_user_id: string;
  controller_user_id: string;
  created_at: string;
  owner_user: RelationshipUser | null;
  controller_user: RelationshipUser | null;
}

export interface RelationshipResponse {
  relationship: Relationship;
}

export type InviteStatus = 'pending' | 'accepted' | 'expired' | 'revoked';

export interface Invite {
  id: string;
  owner_user_id: string;
  invitee_email: string;
  token: string;
  status: InviteStatus;
  created_at: string;
  expires_at: string | null;
}

export interface InviteResponse {
  invite: Invite;
}

export type ZapRequestStatus = 'created' | 'executed' | 'not_started' | 'acknowledged' | 'expired';

export interface ZapRequest {
  id: string;
  task_id: string;
  owner_user_id: string;
  controller_user_id: string;
  created_at: string;
  ack_deadline_at: string;
  status: ZapRequestStatus;
  attempted_zaps: number;
  succeeded_zaps: number;
  last_error_code: string | null;
  last_error_message: string | null;
}

export interface ZapResponse {
  zap_request: ZapRequest;
}

export type GiftStatus = 'pending' | 'used';

export interface GiftUser {
  id: string;
  email: string;
  display_name: string | null;
}

export interface Gift {
  id: string;
  owner_user_id: string;
  controller_user_id: string;
  message: string;
  status: GiftStatus;
  created_at: string;
  used_at: string | null;
  task_id: string | null;
  owner_user: GiftUser | null;
  controller_user: GiftUser | null;
}

export interface GiftUseResponse {
  gift: Gift;
  task: AppTask;
}

export type RoutineFrequency = 'daily' | 'weekly' | 'monthly' | 'custom';

export const routineFrequencyLabel: Record<RoutineFrequency, string> = {
  daily: '毎日',
  weekly: '毎週',
  monthly: '毎月',
  custom: 'カスタム',
};

export interface Routine {
  id: string;
  owner_user_id: string;
  controller_user_id: string | null;
  title: string;
  zap_criteria: string | null;
  reminder_minutes: number;
  frequency: RoutineFrequency;
  custom_datetimes: string[] | null;
  is_active: boolean;
  created_at: string;
  next_run_at: string | null;
}
