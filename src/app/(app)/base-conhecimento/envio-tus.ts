'use client'

// O envio retomável (TUS) do navegador direto ao Storage. O arquivo não passa pelo servidor do
// CRM: `iniciarEnvio` cunha um token para UM caminho e este módulo manda os bytes em pedaços.
//
// Retomada depois de recarregar a página (Review Focus 1): a chave abaixo é a impressão digital
// que o tus guarda no localStorage junto com a URL do envio. Escolher o MESMO arquivo para o
// MESMO documento acha o envio anterior e continua de onde parou. A tela guarda, sob a mesma
// chave, o `versaoId` para pedir ao servidor a mesma versão (mesmo caminho, token novo).
import * as tus from 'tus-js-client'
import type { DadosDoEnvio } from './acoes-documentos'

type ArquivoIdentificavel = { name: string; size: number; lastModified: number }

/** Mesmo arquivo (nome, tamanho e data) e mesmo documento → mesma chave. */
export function chaveDeRetomada(a: ArquivoIdentificavel, documentoId: string | null): string {
  return `base:${documentoId ?? 'novo'}:${a.name}:${a.size}:${a.lastModified}`
}

const PREFIXO_VERSAO = 'base-versao:'

/** O `versaoId` guardado para esta chave, se houver (localStorage pode estar bloqueado). */
export function lerVersaoGuardada(chave: string): string | null {
  try {
    const bruto = window.localStorage.getItem(PREFIXO_VERSAO + chave)
    if (!bruto) return null
    const v = JSON.parse(bruto) as { versaoId?: unknown }
    return typeof v.versaoId === 'string' && v.versaoId ? v.versaoId : null
  } catch {
    return null
  }
}

export function guardarVersao(chave: string, versaoId: string): void {
  try {
    window.localStorage.setItem(PREFIXO_VERSAO + chave, JSON.stringify({ versaoId }))
  } catch {
    // Sem localStorage o envio só não retoma depois de recarregar; ele mesmo funciona.
  }
}

export function esquecerVersao(chave: string): void {
  try {
    window.localStorage.removeItem(PREFIXO_VERSAO + chave)
  } catch {
    // idem
  }
}

/** A promessa do envio termina com isto quando a pessoa cancela — não é erro para mostrar. */
export class EnvioCancelado extends Error {
  constructor() {
    super('Envio cancelado.')
    this.name = 'EnvioCancelado'
  }
}

/**
 * Manda o arquivo. `cancelar` interrompe e pede ao Storage para descartar o que já chegou; a
 * tela chama `cancelarEnvio` no servidor para a linha da versão.
 */
export function enviarArquivo(
  arquivo: File,
  dados: DadosDoEnvio,
  aoProgresso: (enviados: number, total: number) => void,
  documentoId: string | null = null,
): { promessa: Promise<void>; cancelar: () => void } {
  let upload: tus.Upload | null = null
  let cancelado = false
  let desistir: (err: Error) => void = () => {}

  const promessa = new Promise<void>((resolver, rejeitar) => {
    desistir = rejeitar
    upload = new tus.Upload(arquivo, {
      endpoint: dados.endpoint,
      headers: { 'x-signature': dados.token, apikey: dados.chaveAnonima },
      chunkSize: 6 * 1024 * 1024,
      retryDelays: [0, 3000, 5000, 10000, 20000],
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      fingerprint: async (f) => chaveDeRetomada(f, documentoId),
      metadata: {
        bucketName: dados.bucket,
        objectName: dados.caminho,
        contentType: dados.contentType,
        cacheControl: '3600',
      },
      onProgress: (enviados, total) => aoProgresso(enviados, total),
      onSuccess: () => resolver(),
      onError: (err) => rejeitar(err),
    })

    const u = upload
    // Só retoma o envio anterior que ia para o MESMO caminho: se o servidor abriu uma versão nova
    // (a antiga já não estava `enviando`), a URL guardada é de outro objeto e o token novo não
    // vale para ela. As sobras dessa impressão digital saem do localStorage.
    u.findPreviousUploads()
      .then(async (anteriores) => {
        if (cancelado) return
        const mesmo = anteriores.find((a) => a.metadata?.objectName === dados.caminho)
        const armazenamento = tus.defaultOptions.urlStorage
        for (const a of anteriores) {
          if (a !== mesmo) await armazenamento.removeUpload(a.urlStorageKey).catch(() => {})
        }
        if (cancelado) return
        if (mesmo) u.resumeFromPreviousUpload(mesmo)
        u.start()
      })
      .catch(() => {
        if (!cancelado) u.start()
      })
  })

  function cancelar() {
    cancelado = true
    const u = upload as tus.Upload | null
    // `abort(true)` também apaga a impressão digital e pede o descarte do envio no Storage.
    u?.abort(true).catch(() => {})
    desistir(new EnvioCancelado())
  }

  return { promessa, cancelar }
}
