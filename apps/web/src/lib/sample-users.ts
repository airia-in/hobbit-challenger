export interface SampleUsersState {
  users: Array<{ id: string; name: string; email: string }>;
  available: boolean;
}

export async function getSampleUsers(): Promise<SampleUsersState> {
  return { users: [], available: false };
}
