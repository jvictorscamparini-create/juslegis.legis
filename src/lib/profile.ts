// Regras do perfil do usuário (nome e senha), compartilhadas entre o formulário e os testes.

export const MAX_NAME_LENGTH = 120;
export const MIN_NEW_PASSWORD_LENGTH = 8;

/** Normaliza o nome: tira espaços das pontas e colapsa espaços repetidos. */
export function normalizeFullName(raw: string) {
  return raw.trim().replace(/\s+/g, " ");
}

/** Devolve a mensagem de erro do nome, ou null se estiver válido. */
export function fullNameError(raw: string) {
  const name = normalizeFullName(raw);
  if (name.length < 2) return "Informe seu nome completo.";
  if (name.length > MAX_NAME_LENGTH) return `O nome pode ter no máximo ${MAX_NAME_LENGTH} caracteres.`;
  return null;
}

/** Devolve a mensagem de erro da nova senha, ou null se estiver válida. */
export function newPasswordError(password: string, confirmation: string) {
  if (password.length < MIN_NEW_PASSWORD_LENGTH) return `A senha deve ter pelo menos ${MIN_NEW_PASSWORD_LENGTH} caracteres.`;
  if (password !== confirmation) return "As senhas não conferem.";
  return null;
}

export function passwordUpdateError(error: { status?: number; code?: string }) {
  if (error.status === 429 || error.code === "over_request_rate_limit") return "Muitas tentativas. Aguarde alguns instantes e tente de novo.";
  if (error.code === "same_password") return "A nova senha precisa ser diferente da atual.";
  if (error.code === "weak_password") return "Escolha uma senha mais forte.";
  if (error.code === "reauthentication_needed") return "Por segurança, saia e entre de novo antes de trocar a senha.";
  return "Não foi possível atualizar a senha agora. Tente novamente.";
}
