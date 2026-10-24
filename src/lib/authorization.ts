export type AdminAuthorizationProfile = { role: string; status: string };

/** Admin eligibility comes only from the server-managed profile, never editable user metadata. */
export function isAdminProfile(profile: AdminAuthorizationProfile | null | undefined) {
  return !!profile && profile.role === "admin" && profile.status === "active";
}
