import { describe, expect, it } from "vitest";
import { fullNameError, MAX_NAME_LENGTH, MIN_NEW_PASSWORD_LENGTH, newPasswordError, normalizeFullName, passwordUpdateError } from "@/lib/profile";

describe("perfil do usuário", () => {
  it("normaliza o nome removendo espaços sobrando", () => {
    expect(normalizeFullName("  Maria   da  Silva ")).toBe("Maria da Silva");
  });

  it("recusa nome vazio, de uma letra ou longo demais", () => {
    expect(fullNameError("   ")).toMatch(/nome completo/);
    expect(fullNameError("A")).toMatch(/nome completo/);
    expect(fullNameError("A".repeat(MAX_NAME_LENGTH + 1))).toMatch(/no máximo/);
    expect(fullNameError("Maria Silva")).toBeNull();
  });

  it("exige senha com tamanho mínimo e confirmação igual", () => {
    expect(newPasswordError("curta", "curta")).toMatch(new RegExp(`${MIN_NEW_PASSWORD_LENGTH} caracteres`));
    expect(newPasswordError("senha-longa-1", "senha-longa-2")).toMatch(/não conferem/);
    expect(newPasswordError("senha-longa-1", "senha-longa-1")).toBeNull();
  });

  it("traduz erros da troca de senha sem expor a mensagem original", () => {
    expect(passwordUpdateError({ code: "same_password" })).toMatch(/diferente da atual/);
    expect(passwordUpdateError({ code: "weak_password" })).toMatch(/mais forte/);
    expect(passwordUpdateError({ code: "reauthentication_needed" })).toMatch(/entre de novo/);
    expect(passwordUpdateError({ status: 429 })).toMatch(/Muitas tentativas/);
    expect(passwordUpdateError({ code: "outro" })).toMatch(/Não foi possível atualizar/);
  });
});
