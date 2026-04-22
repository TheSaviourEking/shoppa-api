import type { User } from '@prisma/client';

/**
 * Client-facing User shape. Drops server-internal fields (passwordHash,
 * updatedAt) and adds a fully-qualified `avatarUrl` derived from
 * `avatarKey` so clients don't need to know anything about S3.
 */
export interface PublicUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  avatarKey: string | null;
  avatarUrl: string | null;
  goal: User['goal'];
  notificationsEnabled: boolean;
  createdAt: Date;
}

export function toPublicUser(user: User, s3PublicBaseUrl: string): PublicUser {
  return {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    phone: user.phone,
    avatarKey: user.avatarKey,
    avatarUrl: user.avatarKey ? `${s3PublicBaseUrl.replace(/\/$/, '')}/${user.avatarKey}` : null,
    goal: user.goal,
    notificationsEnabled: user.notificationsEnabled,
    createdAt: user.createdAt,
  };
}
