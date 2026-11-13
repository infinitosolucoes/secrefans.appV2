import { Checkbox } from "@/components/ui";

/** Versão do texto da declaração gravada junto com o conteúdo (mudar o texto = nova versão). */
export const ATTESTATION_VERSION = "2026-11";

/** Declaração obrigatória para publicar (direitos + maioridade e consentimento de quem aparece). */
export function ContentAttestation() {
  return (
    <Checkbox name="attest">
      Declaro que tenho os direitos sobre este conteúdo e que todas as pessoas que aparecem nele são
      maiores de 18 anos e consentiram com a gravação e a publicação.
    </Checkbox>
  );
}

export const ATTESTATION_REQUIRED =
  "Para publicar, marque a declaração de direitos e consentimento.";
