import { AuthService } from './authService';
import type {
  AppTask,
  AppUser,
  Gift,
  GiftUseResponse,
  Invite,
  InviteResponse,
  Relationship,
  RelationshipResponse,
  Routine,
  RoutineFrequency,
  TaskStatus,
  ZapRequest,
  ZapResponse,
} from '../types';

const BASE_URL = 'https://zapapp-iszt.onrender.com';

async function authorizedRequest(
  path: string,
  options: { method?: string; query?: Record<string, string | undefined> } = {}
): Promise<RequestInit & { url: string }> {
  const token = await AuthService.getIDToken();

  const url = new URL(path, BASE_URL);
  if (options.query) {
    for (const [key, value] of Object.entries(options.query)) {
      if (value !== undefined) url.searchParams.set(key, value);
    }
  }

  return {
    url: url.toString(),
    method: options.method ?? 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  };
}

async function perform<T>(req: RequestInit & { url: string }, body?: unknown): Promise<T> {
  const { url, ...init } = req;
  if (body !== undefined) {
    init.body = JSON.stringify(body);
  }
  const response = await fetch(url, init);
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`[${response.status}] ${text}`);
  }
  return text ? (JSON.parse(text) as T) : (undefined as T);
}

function statusQuery(status?: TaskStatus[]): string | undefined {
  return status && status.length > 0 ? status.join(',') : undefined;
}

export const APIClient = {
  // MARK: - Device

  async registerDevice(pushToken: string, environment: string): Promise<void> {
    const req = await authorizedRequest('/devices', { method: 'POST' });
    await perform(req, { push_token: pushToken, environment, platform: 'android' });
  },

  // MARK: - Me

  async getMyProfile(): Promise<AppUser> {
    const req = await authorizedRequest('/me/profile');
    return perform(req);
  },

  async connectPavlok(email: string, password: string): Promise<void> {
    const req = await authorizedRequest('/me/pavlok/token', { method: 'POST' });
    await perform(req, { email, password });
  },

  async disconnectPavlok(): Promise<void> {
    const req = await authorizedRequest('/me/pavlok/token', { method: 'DELETE' });
    await perform(req);
  },

  async deleteAccount(): Promise<void> {
    const req = await authorizedRequest('/me', { method: 'DELETE' });
    await perform(req);
  },

  // MARK: - Invite

  async createInvite(inviteeEmail: string): Promise<InviteResponse> {
    const req = await authorizedRequest('/invites', { method: 'POST' });
    return perform(req, { invitee_email: inviteeEmail });
  },

  async getInvites(status?: string): Promise<Invite[]> {
    const req = await authorizedRequest('/invites', { query: { status } });
    return perform(req);
  },

  async acceptInvite(token: string): Promise<RelationshipResponse> {
    const req = await authorizedRequest('/invites/accept', { method: 'POST' });
    return perform(req, { token });
  },

  // MARK: - Relationship

  async getRelationships(): Promise<Relationship[]> {
    const req = await authorizedRequest('/relationships');
    return perform(req);
  },

  async deleteRelationship(relationshipId: string): Promise<void> {
    const req = await authorizedRequest(`/relationships/${relationshipId}`, { method: 'DELETE' });
    await perform(req);
  },

  // MARK: - Task (Owner)

  async createTask(params: {
    title: string;
    zapCriteria?: string | null;
    dueAt: Date;
    controllerUserId?: string | null;
    reminderMinutes?: number;
  }): Promise<AppTask> {
    const req = await authorizedRequest('/tasks', { method: 'POST' });
    return perform(req, {
      title: params.title,
      zap_criteria: params.zapCriteria || null,
      due_at: params.dueAt.toISOString(),
      controller_user_id: params.controllerUserId ?? null,
      reminder_minutes: params.reminderMinutes ?? 5,
    });
  },

  async getTasks(status?: TaskStatus[]): Promise<AppTask[]> {
    const req = await authorizedRequest('/tasks', { query: { status: statusQuery(status) } });
    return perform(req);
  },

  async getTask(taskId: string): Promise<AppTask> {
    const req = await authorizedRequest(`/tasks/${taskId}`);
    return perform(req);
  },

  async selfCompleteTask(taskId: string): Promise<AppTask> {
    const req = await authorizedRequest(`/tasks/${taskId}/self_complete`, { method: 'POST' });
    return perform(req);
  },

  async updateTaskController(taskId: string, controllerUserId: string): Promise<AppTask> {
    const req = await authorizedRequest(`/tasks/${taskId}/controller`, { method: 'PATCH' });
    return perform(req, { controller_user_id: controllerUserId });
  },

  // MARK: - Task (Controller)

  async getOwnerTasks(ownerUserId: string, status?: TaskStatus[]): Promise<AppTask[]> {
    const req = await authorizedRequest(`/owners/${ownerUserId}/tasks`, {
      query: { status: statusQuery(status) },
    });
    return perform(req);
  },

  async deleteTask(taskId: string): Promise<void> {
    const req = await authorizedRequest(`/tasks/${taskId}`, { method: 'DELETE' });
    await perform(req);
  },

  async approveTask(taskId: string): Promise<void> {
    const req = await authorizedRequest(`/tasks/${taskId}/approve`, { method: 'POST' });
    await perform(req);
  },

  async sendZap(taskId: string): Promise<ZapResponse> {
    const req = await authorizedRequest(`/tasks/${taskId}/zap`, { method: 'POST' });
    return perform(req);
  },

  // MARK: - ZapRequest

  async getLatestZapRequest(taskId: string): Promise<ZapRequest> {
    const req = await authorizedRequest(`/tasks/${taskId}/latest_zap_request`);
    return perform(req);
  },

  async getMyZapRequests(status?: string): Promise<ZapRequest[]> {
    const req = await authorizedRequest('/me/zap_requests', { query: { status } });
    return perform(req);
  },

  async ackZapRequest(id: string): Promise<void> {
    const req = await authorizedRequest(`/zap_requests/${id}/ack`, { method: 'POST' });
    await perform(req);
  },

  // MARK: - Gift

  async sendGift(controllerUserId: string, message: string): Promise<Gift> {
    const req = await authorizedRequest('/gifts', { method: 'POST' });
    return perform(req, { controller_user_id: controllerUserId, message });
  },

  async getSentGifts(): Promise<Gift[]> {
    const req = await authorizedRequest('/gifts/sent');
    return perform(req);
  },

  async getReceivedGifts(): Promise<Gift[]> {
    const req = await authorizedRequest('/gifts/received');
    return perform(req);
  },

  async useGift(giftId: string, title: string, dueAt: Date): Promise<GiftUseResponse> {
    const req = await authorizedRequest(`/gifts/${giftId}/use`, { method: 'POST' });
    return perform(req, { title, due_at: dueAt.toISOString() });
  },

  // MARK: - Routine

  async getRoutines(): Promise<Routine[]> {
    const req = await authorizedRequest('/routines');
    return perform(req);
  },

  async createRoutine(params: {
    title: string;
    zapCriteria?: string | null;
    controllerUserId?: string | null;
    reminderMinutes?: number;
    frequency: RoutineFrequency;
    firstRunAt?: Date;
    customDatetimes?: Date[];
  }): Promise<Routine> {
    const req = await authorizedRequest('/routines', { method: 'POST' });
    return perform(req, {
      title: params.title,
      zap_criteria: params.zapCriteria || null,
      controller_user_id: params.controllerUserId ?? null,
      reminder_minutes: params.reminderMinutes ?? 5,
      frequency: params.frequency,
      first_run_at: params.firstRunAt?.toISOString(),
      custom_datetimes: params.customDatetimes?.map((d) => d.toISOString()),
    });
  },

  async updateRoutine(
    routineId: string,
    params: {
      title?: string;
      zapCriteria?: string | null;
      controllerUserId?: string | null;
      reminderMinutes?: number;
      isActive?: boolean;
      customDatetimes?: Date[];
    }
  ): Promise<Routine> {
    const req = await authorizedRequest(`/routines/${routineId}`, { method: 'PATCH' });
    return perform(req, {
      title: params.title,
      zap_criteria: params.zapCriteria,
      controller_user_id: params.controllerUserId,
      reminder_minutes: params.reminderMinutes,
      is_active: params.isActive,
      custom_datetimes: params.customDatetimes?.map((d) => d.toISOString()),
    });
  },

  async deleteRoutine(routineId: string): Promise<void> {
    const req = await authorizedRequest(`/routines/${routineId}`, { method: 'DELETE' });
    await perform(req);
  },
};
