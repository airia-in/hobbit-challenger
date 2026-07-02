import type { Activity } from '@workspace-starter/db';

export type ProofRuleActivity = Pick<
  Activity,
  'allowsProof' | 'autoCompleteOnProof'
>;

export function canAttachProofToActivity(activity: ProofRuleActivity): boolean {
  return activity.allowsProof;
}

export function shouldAutoCompleteOnProof(
  activity: ProofRuleActivity,
  proofUrl: string | null | undefined,
): boolean {
  return (
    activity.allowsProof && activity.autoCompleteOnProof && Boolean(proofUrl)
  );
}
