/* O nome que o site mostra é o apelido aprovado, e só na falta dele o nome do
 * cadastro. O apelido passa por moderação, então é seguro publicá-lo.
 *
 * A mesma regra vive no banco, no `coalesce(nullif(btrim(apelido), ''), nome)`
 * das views que publicam nome. Isto aqui é para quem lê a `dMembros` direto, e
 * as duas precisam concordar: o resumo do treino fechado casa as linhas da
 * v_registro_treinos com as da tela pelo nome, e um lado dizendo apelido e o
 * outro nome oficial quebraria esse encontro. */
export function nomeExibido(m?: { nome?: string | null; apelido?: string | null } | null): string {
  return m?.apelido?.trim() || m?.nome?.trim() || "";
}

/** O nome do cadastro, só quando ele não é o que já está sendo mostrado. */
export function nomeOficialSeDiferente(
  m?: { nome?: string | null; apelido?: string | null } | null,
): string | null {
  const oficial = m?.nome?.trim();
  return oficial && oficial !== nomeExibido(m) ? oficial : null;
}
