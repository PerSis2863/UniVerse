/** LinkedIn "Add to profile" certification URL (no API; opens LinkedIn's form). */

export type LinkedInCertInput = {
  name: string;
  organizationName?: string;
  issuedAt: Date | string;
  certUrl: string;
  certId: string;
};

export function linkedInAddCertificationUrl(input: LinkedInCertInput): string {
  const issued = input.issuedAt instanceof Date ? input.issuedAt : new Date(input.issuedAt);
  const y = Number.isFinite(issued.getTime()) ? issued.getUTCFullYear() : new Date().getUTCFullYear();
  const m = Number.isFinite(issued.getTime()) ? issued.getUTCMonth() + 1 : 1;
  const q = new URLSearchParams({
    startTask: 'CERTIFICATION_NAME',
    name: input.name.slice(0, 100),
    organizationName: (input.organizationName || 'UniVerse Impact').slice(0, 100),
    issueYear: String(y),
    issueMonth: String(m),
    certUrl: input.certUrl.slice(0, 500),
    certId: input.certId.slice(0, 64),
  });
  return `https://www.linkedin.com/profile/add?${q.toString()}`;
}
