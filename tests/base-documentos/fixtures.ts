// Geradores de arquivos mínimos para os testes de extração: um .docx montado com adm-zip e um
// PDF 1.4 escrito à mão (Helvetica, um `Tj` por linha, `/Outlines` opcional, xref calculado).
import AdmZip from 'adm-zip'

type BlocoDocx = { estilo?: 'Heading1' | 'Heading2'; texto: string } | { tabela: string[][] }

const xmlEsc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

function paragrafo(texto: string, estilo?: string): string {
  const pPr = estilo ? `<w:pPr><w:pStyle w:val="${estilo}"/></w:pPr>` : ''
  return `<w:p>${pPr}<w:r><w:t xml:space="preserve">${xmlEsc(texto)}</w:t></w:r></w:p>`
}

export function docxMinimo(blocos: BlocoDocx[]): Uint8Array {
  const corpo = blocos
    .map((b) =>
      'tabela' in b
        ? `<w:tbl>${b.tabela.map((linha) => `<w:tr>${linha.map((c) => `<w:tc>${paragrafo(c)}</w:tc>`).join('')}</w:tr>`).join('')}</w:tbl>`
        : paragrafo(b.texto, b.estilo),
    )
    .join('')
  const zip = new AdmZip()
  zip.addFile(
    '[Content_Types].xml',
    Buffer.from(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
        '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>' +
        '</Types>',
    ),
  )
  zip.addFile(
    '_rels/.rels',
    Buffer.from(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
        '</Relationships>',
    ),
  )
  zip.addFile(
    'word/_rels/document.xml.rels',
    Buffer.from(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
        '</Relationships>',
    ),
  )
  zip.addFile(
    'word/styles.xml',
    Buffer.from(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
        '<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/></w:style>' +
        '<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/></w:style>' +
        '</w:styles>',
    ),
  )
  zip.addFile(
    'word/document.xml',
    Buffer.from(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
        `<w:body>${corpo}</w:body></w:document>`,
    ),
  )
  return new Uint8Array(zip.toBuffer())
}

/** Um zip válido, mas sem `word/document.xml`. */
export function zipSemDocumento(): Uint8Array {
  const zip = new AdmZip()
  zip.addFile('qualquer.txt', Buffer.from('nada'))
  return new Uint8Array(zip.toBuffer())
}

/** Item do contorno; `pagina` fora do intervalo vira um destino nomeado que não existe. */
export type ItemContorno = { titulo: string; pagina: number; filhos?: ItemContorno[] }

const pdfEsc = (s: string) => s.replace(/[\\()]/g, (c) => `\\${c}`)
const utf16Hex = (s: string) =>
  'FEFF' + Array.from(s).map((c) => c.charCodeAt(0).toString(16).padStart(4, '0').toUpperCase()).join('')

/** Quebra em linhas de até 80 caracteres: o pdfjs ignora o texto que sai da página. */
function quebrarLinha(linha: string): string[] {
  const saida: string[] = []
  let atual = ''
  for (const palavra of linha.split(' ')) {
    if (atual && (atual + ' ' + palavra).length > 80) {
      saida.push(atual)
      atual = palavra
    } else atual = atual ? `${atual} ${palavra}` : palavra
  }
  saida.push(atual)
  return saida
}

export function pdfMinimo(paginas: string[], opts?: { contorno?: ItemContorno[] }): Uint8Array {
  const objetos: string[] = [] // índice i → objeto i+1
  const reservar = () => objetos.push('') // devolve o número do objeto
  const catalogo = reservar()
  const raizPaginas = reservar()
  const fonte = reservar()
  objetos[fonte - 1] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'

  const numerosPagina: number[] = []
  for (const texto of paginas) {
    const pagina = reservar()
    const conteudo = reservar()
    numerosPagina.push(pagina)
    const linhas = texto ? texto.split('\n').flatMap(quebrarLinha) : []
    const fluxo = linhas.length
      ? `BT /F1 12 Tf 14 TL 72 720 Td ${linhas.map((l, i) => `${i ? 'T* ' : ''}(${pdfEsc(l)}) Tj`).join(' ')} ET`
      : ''
    objetos[conteudo - 1] = `<< /Length ${Buffer.byteLength(fluxo, 'latin1')} >>\nstream\n${fluxo}\nendstream`
    objetos[pagina - 1] =
      `<< /Type /Page /Parent ${raizPaginas} 0 R /MediaBox [0 0 612 792] ` +
      `/Resources << /Font << /F1 ${fonte} 0 R >> >> /Contents ${conteudo} 0 R >>`
  }
  objetos[raizPaginas - 1] =
    `<< /Type /Pages /Kids [${numerosPagina.map((n) => `${n} 0 R`).join(' ')}] /Count ${numerosPagina.length} >>`

  let outlines = ''
  if (opts?.contorno?.length) {
    const raiz = reservar()
    const montar = (itens: ItemContorno[], pai: number): { primeiro: number; ultimo: number; total: number } => {
      const nums = itens.map(() => reservar())
      let total = itens.length
      itens.forEach((item, i) => {
        const n = nums[i]
        const dest =
          item.pagina >= 1 && item.pagina <= numerosPagina.length
            ? `[${numerosPagina[item.pagina - 1]} 0 R /Fit]`
            : '(destino-que-nao-existe)'
        let filhos = ''
        if (item.filhos?.length) {
          const f = montar(item.filhos, n)
          total += f.total
          filhos = ` /First ${f.primeiro} 0 R /Last ${f.ultimo} 0 R /Count ${f.total}`
        }
        objetos[n - 1] =
          `<< /Title <${utf16Hex(item.titulo)}> /Parent ${pai} 0 R /Dest ${dest}` +
          (i > 0 ? ` /Prev ${nums[i - 1]} 0 R` : '') +
          (i < nums.length - 1 ? ` /Next ${nums[i + 1]} 0 R` : '') +
          `${filhos} >>`
      })
      return { primeiro: nums[0], ultimo: nums[nums.length - 1], total }
    }
    const r = montar(opts.contorno, raiz)
    objetos[raiz - 1] = `<< /Type /Outlines /First ${r.primeiro} 0 R /Last ${r.ultimo} 0 R /Count ${r.total} >>`
    outlines = ` /Outlines ${raiz} 0 R`
  }
  objetos[catalogo - 1] = `<< /Type /Catalog /Pages ${raizPaginas} 0 R${outlines} >>`

  let saida = '%PDF-1.4\n'
  const offsets: number[] = []
  objetos.forEach((corpo, i) => {
    offsets.push(Buffer.byteLength(saida, 'latin1'))
    saida += `${i + 1} 0 obj\n${corpo}\nendobj\n`
  })
  const inicioXref = Buffer.byteLength(saida, 'latin1')
  saida += `xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n`
  for (const o of offsets) saida += `${String(o).padStart(10, '0')} 00000 n \n`
  saida += `trailer\n<< /Size ${objetos.length + 1} /Root ${catalogo} 0 R >>\nstartxref\n${inicioXref}\n%%EOF\n`
  return new Uint8Array(Buffer.from(saida, 'latin1'))
}
