import { contraste } from '@/lib/contraste'



const BRANCO = '#FFFFFF'


export const PIOR_FUNDO_ESCURO = '#17171F'


export const SUPERFICIE_ESCURA = '#101016'


export const PISO_BRANCO = 4.5

export const PISO_ESCURO = 4.5


const PISO_HOVER = 6.5
const PISO_ACTIVE = 8.5

/**
 * 🔴 O piso do que PREENCHE, e ele é medido contra BRANCO — não contra o fundo. Ver a nota de
 * `Paleta['cheio']`: quem pinta um chão de cor cheia carrega tinta branca por cima.
 *
 * Bate com `PISO_BRANCO` (o portão da marca) de propósito, e por uma razão que vale mais que a
 * coincidência: se a cor da marca já é aprovada contra BRANCO, ela já pode pintar um botão com
 * tinta branca sem nenhum passo extra. A rampa cheia de uma cor já aprovada sai IDÊNTICA à cor
 * pedida pelo dono — o botão fica com a cor que ele escolheu, e ainda sustenta o rótulo.
 */
const PISO_CHEIO = PISO_BRANCO


export const PISO_WASH = 4.5


const PISO_HOVER_ESCURO = 6.5
const PISO_ATIVO_ESCURO = 8


const PASSO_VISIVEL = 0.12


const PASSO_ABSOLUTO = 6


export type Paleta = {
  accent: string
  hover: string
  active: string
  wash: string
  line: string
  /**
   * 🔴 A RAMPA DO QUE PREENCHE, e ela é separada de `accent` de propósito.
   *
   * O defeito que ela existe para matar: `accent` é medido contra o CHÃO (fundo, superfície), porque
   * é a cor de LINK e de texto de ação. No tema escuro o derivador tem de CLARAR a cor da marca
   * até ela dar 4,5:1 contra o fundo — a `#3D5AFE` virava `#5A73FE`. E o botão primário usava
   * esse mesmo valor como PINTURA, com tinta quase-preta por cima: 4,97 de contraste, aprovado, e
   * ainda assim lavado. Medido no navegador: o botão habilitado e o desabilitado (opacity 0,55)
   * ficavam visualmente quase iguais — o estado errado parecia certo.
   *
   * Quem preenche um chão de cor cheia tem a restrição OPOSTA da quem escreve texto: precisa
   * sustentar tinta BRANCA por cima, logo tem de ser ESCURA. Nenhuma cor faz as duas coisas, e
   * é por isso que são dois tokens e não um com dois nomes.
   *
   * ⚠️ Por isso estes valores são IGUAIS nos dois temas, ao contrário de `accent`: a tinta por
   * cima é branca nos dois, então a medição é contra branco e a rampa ESCURECE nos dois
   * ("apertar aproxima" não tem tema). Só o que muda entre os temas é o `--acento` de texto.
   */
  cheio: string
  cheioHover: string
  cheioAtivo: string
}

export type Marca = {
  
  accent: string
  claro: Paleta
  escuro: Paleta
}

export type ErroMarca = { erro: 'hex_invalido' } | { erro: 'contraste_baixo'; medido: number }

function componentes(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function paraHex([r, g, b]: [number, number, number]): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)))
  return `#${[r, g, b].map((v) => clamp(v).toString(16).padStart(2, '0')).join('')}`.toUpperCase()
}


function misturar(hex: string, alvo: [number, number, number], f: number): string {
  const [r, g, b] = componentes(hex)
  return paraHex([r + (alvo[0] - r) * f, g + (alvo[1] - g) * f, b + (alvo[2] - b) * f])
}


function deslocar(hex: string, n: number): string {
  const [r, g, b] = componentes(hex)
  return paraHex([r + n, g + n, b + n])
}

const PRETO_RGB: [number, number, number] = [0, 0, 0]
const BRANCO_RGB: [number, number, number] = [255, 255, 255]

const SUPERFICIE_ESCURA_RGB = componentes(SUPERFICIE_ESCURA)


function escurecerAte(hex: string, piso: number): string {
  let atual = hex
  for (let i = 0; i < 100 && contraste(atual, BRANCO) < piso; i++) {
    atual = misturar(atual, PRETO_RGB, 0.04)
  }
  return atual
}


function clarearAte(hex: string, piso: number): string {
  let atual = hex
  for (let i = 0; i < 100 && contraste(atual, PIOR_FUNDO_ESCURO) < piso; i++) {
    atual = misturar(atual, BRANCO_RGB, 0.04)
  }
  return atual
}


function washAte(
  hex: string,
  alvo: [number, number, number],
  fInicial: number,
  piso: number,
): string {
  let f = fInicial
  let atual = misturar(hex, alvo, f)
  while (f < 1 && contraste(hex, atual) < piso) {
    f = Math.min(1, f + 0.02)
    atual = misturar(hex, alvo, f)
  }
  return atual
}

/**
 * 🔴 A RAMPA DO QUE PREENCHE — o chão de cor cheia (botão primário, botão de tom), que leva tinta
 * BRANCA por cima.
 *
 * Ela é medida contra BRANCO e ESCURECE, e é a OPOSTA de `derivarEscuro`, que mede contra o fundo
 * e CLARECA. Sobrepor as duas é o defeito: um valor clareado para ler sobre fundo escuro, usado
 * como pintura com tinta escura por cima, passa em contraste e lava o botão.
 *
 * ⚠️ Os degraus (4,5 → 6,5 → 8,5) são os MESMOS da rampa de texto, de propósito: os dois têm
 * BRANCO ou o fundo como referência de folga, e o que separa um estado do outro é o mesmo passo
 * perceptual.
 *
 * ⚠️ Ela é a MESMA nos dois temas (ver a nota de `Paleta['cheio']`): a tinta por cima é branca
 * nos dois, então a medição é contra branco e a rampa escurece nos dois.
 */
function cheioDe(accent: string): Pick<Paleta, 'cheio' | 'cheioHover' | 'cheioAtivo'> {
  const base = escurecerAte(accent, PISO_CHEIO)
  let hover = escurecerAte(misturar(base, PRETO_RGB, PASSO_VISIVEL), PISO_HOVER)
  let ativo = escurecerAte(misturar(hover, PRETO_RGB, PASSO_VISIVEL), PISO_ACTIVE)
  // Marca já escura o bastante para que o passo visual não mova nada: um degrau a menos de rampa
  // é o que faria o hover e o ativo sumirem. Aqui o passo dobra em vez de desaparecer.
  if (hover === base) {
    hover = escurecerAte(misturar(base, PRETO_RGB, PASSO_VISIVEL * 2), PISO_HOVER)
    ativo = escurecerAte(misturar(hover, PRETO_RGB, PASSO_VISIVEL), PISO_ACTIVE)
  }
  if (ativo === hover) {
    ativo = escurecerAte(misturar(hover, PRETO_RGB, PASSO_VISIVEL), PISO_ACTIVE)
  }
  return { cheio: base, cheioHover: hover, cheioAtivo: ativo }
}


function normalizar(entrada: string): string | null {
  const limpo = String(entrada ?? '').trim().toUpperCase()
  const curto = limpo.match(/^#([0-9A-F])([0-9A-F])([0-9A-F])$/)
  if (curto) return `#${curto[1]}${curto[1]}${curto[2]}${curto[2]}${curto[3]}${curto[3]}`
  return /^#[0-9A-F]{6}$/.test(limpo) ? limpo : null
}


/** O que a rampa de TEXTO descreve. A parte que PREENCHE não mora aqui — é `cheioDe`. */
type PaletaTexto = Pick<Paleta, 'accent' | 'hover' | 'active' | 'wash' | 'line'>

function derivarClaro(accent: string): PaletaTexto {
  
  
  
  
  
  
  
  
  
  
  let hover = escurecerAte(misturar(accent, PRETO_RGB, PASSO_VISIVEL), PISO_HOVER)
  
  let active = escurecerAte(misturar(hover, PRETO_RGB, PASSO_VISIVEL), PISO_ACTIVE)

  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  if (hover === accent || active === hover) {
    hover = deslocar(accent, PASSO_ABSOLUTO)
    active = deslocar(hover, PASSO_ABSOLUTO)
  }

  return {
    accent,
    hover,
    active,
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    wash: washAte(accent, BRANCO_RGB, 0.93, PISO_WASH),
    line: misturar(accent, BRANCO_RGB, 0.72),
  }
}


function derivarEscuro(accent: string): PaletaTexto {
  const base = clarearAte(accent, PISO_ESCURO)
  const hover = clarearAte(misturar(base, BRANCO_RGB, PASSO_VISIVEL), PISO_HOVER_ESCURO)
  return {
    accent: base,
    hover,
    active: clarearAte(misturar(hover, BRANCO_RGB, PASSO_VISIVEL), PISO_ATIVO_ESCURO),














    wash: washAte(base, SUPERFICIE_ESCURA_RGB, 0.92, PISO_WASH),
    line: misturar(base, SUPERFICIE_ESCURA_RGB, 0.7),
  }
}

export function derivarMarca(entrada: string): Marca | ErroMarca {
  const accent = normalizar(entrada)
  if (!accent) return { erro: 'hex_invalido' }

  const medido = contraste(accent, BRANCO)
  if (medido < PISO_BRANCO) return { erro: 'contraste_baixo', medido }

  return {
    accent,
    claro: { ...derivarClaro(accent), ...cheioDe(accent) },
    escuro: { ...derivarEscuro(accent), ...cheioDe(accent) },
  }
}
