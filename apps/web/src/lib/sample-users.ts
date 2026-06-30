export interface SampleUsersState {
  users: Array<{
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
  }>;
  available: boolean;
}

export async function getSampleUsers(): Promise<SampleUsersState> {
  return { users: [], available: false };
}
