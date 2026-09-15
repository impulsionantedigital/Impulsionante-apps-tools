#!/usr/bin/env python3
"""Avalia a planilha original e congela o resultado esperado de cada cenário.

A biblioteca `formulas` interpreta o .xlsx e calcula suas fórmulas sem Excel nem
LibreOffice. Ela é um SEGUNDO implementador do mesmo problema, que não conhece o
motor em TypeScript — é isso que torna a comparação uma evidência, e não uma
repetição.

Uso:
    python3 -m venv .venv && source .venv/bin/activate
    pip install -r validacao/requirements.txt
    python validacao/oraculo.py 2025

Lê   validacao/<ano>/cenarios.json
Grava validacao/<ano>/esperado.json

Este script NÃO compara nada: só avalia a planilha e congela a saída dela. A
comparação com o motor fica em tests/indulto-comutacao/motor-2025.spec.ts, que
roda em Vitest sem Python e sem planilha.

Adaptado de validacao/2025/validate-original.py (o harness dos autores da POC).
O mapeamento de células (`build_inputs` e `OUT_MAP`) é o deles, sem alteração;
o que mudou está marcado com "ADAPTAÇÃO".
"""
import datetime
import hashlib
import json
import os
import sys
import warnings

warnings.filterwarnings("ignore")
import formulas  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))

ANOS = ('2024', '2025')
if len(sys.argv) != 2 or sys.argv[1] not in ANOS:
    # Cada decreto traz planilha própria, com células próprias. O mapeamento abaixo
    # é POR ANO: `build_inputs` e `OUT_MAP` de um ano NÃO servem para o outro.
    sys.exit('uso: python validacao/oraculo.py {%s}' % '|'.join(ANOS))

ANO = sys.argv[1]
PASTA = os.path.join(HERE, ANO)

# ADAPTAÇÃO 1: o original apontava para /Users/.../Downloads/. Aqui a planilha é
# resolvida relativa ao próprio script, para rodar em qualquer máquina.
ARQUIVO = 'planilha.xlsx'
SRC = os.path.join(PASTA, ARQUIVO)

# ADAPTAÇÃO 2: a `formulas` endereça cada célula como
#   '[<arquivo com a caixa original>]<ABA EM MAIÚSCULAS>'!<célula>
# O original embutia o nome antigo do arquivo; aqui é o nome real no repositório.
# Prefixo errado não dá erro de leitura: dá KeyError em cada célula — por isso
# `valor()` abaixo falha alto em vez de devolver um marcador.
PFX = "'[" + ARQUIVO + "]{sheet}'!{cell}"


def q(cell):  # célula do Questionario
    return PFX.format(sheet='QUESTIONARIO', cell=cell)


def r(cell):  # célula do Resultado
    return PFX.format(sheet='RESULTADO', cell=cell)


def c(cell):  # célula do Cálculo
    return PFX.format(sheet='CÁLCULO', cell=cell)


# ---------------------------------------------------------------- 2025
# mapa: campo do motor -> como preencher as células do Questionario
# (idêntico ao validate-original.py)
def build_inputs_2025(s):
    inp = {}

    def tempo(prefix, campo):
        t = s.get(campo) or {}
        inp[q(prefix[0])] = t.get('anos', 0)
        inp[q(prefix[1])] = t.get('meses', 0)
        inp[q(prefix[2])] = t.get('dias', 0)
    tempo(('C8', 'D8', 'E8'), 'penaImpeditiva')
    tempo(('C9', 'D9', 'E9'), 'penaViolencia')
    tempo(('C10', 'D10', 'E10'), 'penaSemViolencia')
    tempo(('C15', 'D15', 'E15'), 'penaCumpridaSEEU')
    tempo(('C16', 'D16', 'E16'), 'penaCumpridaNaoSEEU')
    # tempo semiaberto/aberto — a planilha guarda como texto; formulas lida com número
    for pfx, campo in [(('C40', 'D40', 'E40'), 'tempoSemiaberto'), (('C43', 'D43', 'E43'), 'tempoSemiabertoAberto')]:
        t = s.get(campo) or {}
        inp[q(pfx[0])] = t.get('anos', 0)
        inp[q(pfx[1])] = t.get('meses', 0)
        inp[q(pfx[2])] = t.get('dias', 0)
    inp[q('E31')] = s.get('sexo', 'MASCULINO')

    # datas -> serial Excel
    def serial(dstr):
        y, m, d = map(int, dstr.split('-'))
        return (datetime.date(y, m, d) - datetime.date(1899, 12, 30)).days
    inp[q('E33')] = serial(s.get('dataNascimento', '1980-01-01'))
    inp[q('E53')] = serial(s.get('dataUltimaPrisao', '2015-01-01'))
    inp[q('E35')] = s.get('reincidente', 'NÃO')
    inp[q('E37')] = s.get('regime', 'FECHADO')
    inp[q('E45')] = s.get('livramentoCondicional', 'NÃO')
    inp[q('E47')] = s.get('monitoramentoSV56', 'NÃO')
    inp[q('E49')] = s.get('programaEgressos', 'NÃO')
    inp[q('E51')] = s.get('justicaRestaurativa', 'NÃO')
    inp[q('E55')] = s.get('periodoLiberdade2Anos', 'NÃO')
    inp[q('E57')] = s.get('faltaGraveAno', 'NÃO')
    inp[q('E59')] = s.get('faltaGraveExecucao', 'NÃO')
    inp[q('E61')] = s.get('diasRemicao', 0)
    inp[q('E63')] = s.get('colaboracaoPremiada', 'NÃO')
    inp[q('E65')] = s.get('faccao', 'NÃO')
    inp[q('E67')] = s.get('rdd', 'NÃO')
    inp[q('E69')] = s.get('presidioFederal', 'NÃO')
    inp[q('E71')] = s.get('deficiencia', 'NÃO')
    inp[q('E73')] = s.get('condicoesGravesSaude', 'NÃO')
    inp[q('E75')] = s.get('gestante', 'NÃO')
    inp[q('E77')] = s.get('filhoAte16', 'NÃO')
    inp[q('E79')] = s.get('filhoDeficiencia', 'NÃO')
    inp[q('E81')] = s.get('filhoDeficienciaCuidados', 'NÃO')
    inp[q('E83')] = s.get('filhoDoencaCronica', 'NÃO')
    inp[q('E85')] = s.get('filhoDoencaCronicaCuidados', 'NÃO')
    inp[q('E87')] = s.get('homemUnicoResponsavel', 'NÃO')
    inp[q('E89')] = s.get('imprescindivelCrianca', 'NÃO')
    inp[q('E91')] = s.get('avoNetos', 'NÃO')
    inp[q('E93')] = s.get('saidasOuTrabalhoExterno', 'NÃO')
    inp[q('E95')] = s.get('estudo', 'NÃO')
    inp[q('E97')] = s.get('concluiuCurso', 'NÃO')
    inp[q('E99')] = s.get('crimeContraCrianca', 'NÃO')
    inp[q('E101')] = s.get('respondendoOutroCrimeViolento', 'NÃO')
    inp[q('E103')] = s.get('penasSubstituidas', 'NÃO')
    inp[q('E105')] = s.get('condenacaoAberto', 'NÃO')
    inp[q('E107')] = s.get('crimePatrimonio', 'NÃO')
    inp[q('E109')] = s.get('reparouDano', 'NÃO')
    inp[q('E111')] = s.get('valorBemSalarioMinimo', 'NÃO')
    inp[q('E113')] = s.get('cumpriu23ImpeditivoDataFato', 'SIM')
    inp[q('E115')] = s.get('cumpriuFracaoViolenciaDataFato', 'SIM')
    inp[q('E117')] = s.get('valorMulta', 0)
    inp[q('E119')] = s.get('hipossuficiente', 'NÃO')
    return inp


# células de saída na aba Resultado -> chave do motor
# (idêntico ao validate-original.py)
OUT_MAP_2025 = {
    'art9_I.geral': 'D9', 'art9_I.especial': 'E9',
    'art9_II.geral': 'D11', 'art9_II.especial': 'E11',
    'art9_III.geral': 'D13', 'art9_III.especial': 'E13',
    'art9_IV.geral': 'D15', 'art9_IV.especial': 'E15',
    'art9_V.geral': 'D17', 'art9_V.especial': 'E17',
    'art9_VI.geral': 'D19', 'art9_VI.especial': 'E19',
    'art9_VII.geral': 'D21', 'art9_VII.especial': 'E21',
    'art9_VIII.geral': 'D23', 'art9_VIII.especial': 'E23',
    'art9_IX.geral': 'D25', 'art9_IX.especial': 'E25',
    'art9_X.geral': 'D27', 'art9_X.especial': 'E27',
    'art9_XI.geral': 'D29', 'art9_XI.especial': 'E29',
    'art9_XII.geral': 'D31',
    'art9_XIII.geral': 'D33',
    'art9_XIV.geral': 'D35',
    'art9_XV.geral': 'D37',
    'art9_XVI.geral': 'D39',
    'art10.geral': 'D41',
    'art12.geral': 'D43',
    'art11_I.geral': 'D47', 'art11_I.comutacaoTxt': 'E47', 'art11_I.penaAposTxt': 'E48',
    'art11_II.geral': 'D50', 'art11_II.comutacaoTxt': 'E50', 'art11_II.penaAposTxt': 'E51',
    'art11_III.geral': 'D53', 'art11_III.comutacaoTxt': 'E53', 'art11_III.penaAposTxt': 'E54',
    'art13.geral': 'D56', 'art13.comutacaoTxt': 'E56', 'art13.penaAposTxt': 'E57',
    'art13_4.geral': 'D59', 'art13_4.comutacaoTxt': 'E59', 'art13_4.penaAposTxt': 'E60',
}

# Células de APOIO da aba Cálculo — não são saída da tela, e o teste não as
# compara com nada do motor diretamente. Existem só para o caso do bug G149 em
# que a planilha NÃO mostra valor nenhum (§4º preenche, Art. 13 não): aí o
# quantum certo do §4º não aparece na aba Resultado, e o teste o reconstrói a
# partir destas bases, avaliadas pela planilha, com a fórmula do G149 corrigida
# (F149 no lugar de F148). Ver motor-2025.spec.ts.
APOIO_2025 = ['P6', 'P9', 'P13', 'P14', 'P16', 'P17', 'F148', 'F149']


# ---------------------------------------------------------------- 2024
# Decreto 12.338/2024. O Questionario tem 118 linhas (contra 124 em 2025) e a aba
# Resultado começa na coluna C (contra D). NÃO reaproveite o mapa de 2025.

def build_inputs_2024(s):
    inp = {}

    def tempo(prefix, campo):
        t = s.get(campo) or {}
        inp[q(prefix[0])] = t.get('anos', 0)
        inp[q(prefix[1])] = t.get('meses', 0)
        inp[q(prefix[2])] = t.get('dias', 0)

    tempo(('C8', 'D8', 'E8'), 'penaImpeditiva')
    tempo(('C9', 'D9', 'E9'), 'penaViolencia')
    tempo(('C10', 'D10', 'E10'), 'penaSemViolencia')
    tempo(('C15', 'D15', 'E15'), 'penaCumpridaSEEU')
    tempo(('C16', 'D16', 'E16'), 'penaCumpridaNaoSEEU')
    # A planilha guarda estes dois como TEXTO; a formulas lida com número.
    tempo(('C40', 'D40', 'E40'), 'tempoSemiaberto')
    tempo(('C43', 'D43', 'E43'), 'tempoSemiabertoAberto')

    def serial(dstr):
        y, m, d = map(int, dstr.split('-'))
        return (datetime.date(y, m, d) - datetime.date(1899, 12, 30)).days

    inp[q('E31')] = s.get('sexo', 'MASCULINO')
    inp[q('E33')] = serial(s.get('dataNascimento', '1980-01-01'))
    inp[q('E35')] = s.get('reincidente', 'NÃO')
    inp[q('E37')] = s.get('regime', 'FECHADO')
    inp[q('E45')] = s.get('livramentoCondicional', 'NÃO')
    inp[q('E47')] = s.get('monitoramentoSV56', 'NÃO')
    inp[q('E49')] = s.get('programaEgressos', 'NÃO')
    inp[q('E51')] = s.get('justicaRestaurativa', 'NÃO')
    inp[q('E53')] = serial(s.get('dataUltimaPrisao', '2015-01-01'))
    inp[q('E55')] = s.get('periodoLiberdade2Anos', 'NÃO')
    inp[q('E57')] = s.get('faltaGraveAno', 'NÃO')
    inp[q('E59')] = s.get('faltaGraveExecucao', 'NÃO')
    inp[q('E61')] = s.get('diasRemicao', 0)
    inp[q('E63')] = s.get('colaboracaoPremiada', 'NÃO')
    inp[q('E65')] = s.get('faccao', 'NÃO')
    inp[q('E67')] = s.get('rdd', 'NÃO')
    inp[q('E69')] = s.get('presidioFederal', 'NÃO')
    inp[q('E71')] = s.get('deficiencia', 'NÃO')
    inp[q('E73')] = s.get('condicoesGravesSaude', 'NÃO')
    # 🔴 E75..E85 são as SEIS perguntas de 2024 sobre filhos e cuidados. Não há
    # correspondência de um para um com as de 2025 — ver §4 do spec.
    inp[q('E75')] = s.get('gestanteOuFilho14', 'NÃO')
    inp[q('E77')] = s.get('mulherFilho12', 'NÃO')
    inp[q('E79')] = s.get('mulherFilho16', 'NÃO')
    inp[q('E81')] = s.get('homemUnicoResponsavel', 'NÃO')
    inp[q('E83')] = s.get('imprescindivelCrianca', 'NÃO')
    inp[q('E85')] = s.get('avoNetos', 'NÃO')
    inp[q('E87')] = s.get('saidasOuTrabalhoExterno', 'NÃO')
    inp[q('E89')] = s.get('estudo', 'NÃO')
    inp[q('E91')] = s.get('concluiuCurso', 'NÃO')
    inp[q('E93')] = s.get('crimeContraCrianca', 'NÃO')
    inp[q('E95')] = s.get('respondendoOutroCrimeViolento', 'NÃO')
    inp[q('E97')] = s.get('penasSubstituidas', 'NÃO')
    inp[q('E99')] = s.get('condenacaoAberto', 'NÃO')
    inp[q('E101')] = s.get('crimePatrimonio', 'NÃO')
    inp[q('E103')] = s.get('reparouDano', 'NÃO')
    inp[q('E105')] = s.get('valorBemSalarioMinimo', 'NÃO')
    inp[q('E107')] = s.get('cumpriu23ImpeditivoDataFato', 'SIM')
    inp[q('E109')] = s.get('cumpriuFracaoViolenciaDataFato', 'SIM')
    inp[q('E111')] = s.get('valorMulta', 0)
    inp[q('E113')] = s.get('hipossuficiente', 'NÃO')
    return inp


# Aba Resultado de 2024: indulto nas linhas 7..41 (passo 2), coluna C = regra geral
# e D = regra especial; comutação nas linhas 45..53 (passo 2), C = veredito e
# D = quantum. NÃO há "pena após a comutação" em 2024 — a planilha não a calcula.
OUT_MAP_2024 = {
    'art9_I.geral': 'C7', 'art9_I.especial': 'D7',
    'art9_II.geral': 'C9', 'art9_II.especial': 'D9',
    'art9_III.geral': 'C11', 'art9_III.especial': 'D11',
    'art9_IV.geral': 'C13', 'art9_IV.especial': 'D13',
    'art9_V.geral': 'C15', 'art9_V.especial': 'D15',
    'art9_VI.geral': 'C17', 'art9_VI.especial': 'D17',
    'art9_VII.geral': 'C19', 'art9_VII.especial': 'D19',
    'art9_VIII.geral': 'C21', 'art9_VIII.especial': 'D21',
    'art9_IX.geral': 'C23', 'art9_IX.especial': 'D23',
    'art9_X.geral': 'C25', 'art9_X.especial': 'D25',
    'art9_XI.geral': 'C27', 'art9_XI.especial': 'D27',
    'art9_XII.geral': 'C29',
    'art9_XIII.geral': 'C31',
    'art9_XIV.geral': 'C33',
    'art9_XV.geral': 'C35',
    'art9_XVI.geral': 'C37',
    'art10.geral': 'C39',
    'art12.geral': 'C41',
    'art11_I.geral': 'C45', 'art11_I.comutacaoTxt': 'D45',
    'art11_II.geral': 'C47', 'art11_II.comutacaoTxt': 'D47',
    'art11_III.geral': 'C49', 'art11_III.comutacaoTxt': 'D49',
    'art13.geral': 'C51', 'art13.comutacaoTxt': 'D51',
    'art13_4.geral': 'C53', 'art13_4.comutacaoTxt': 'D53',
}

# 2024 NÃO tem o bug G149 (cada quantum é condicionado ao próprio requisito), então
# não há células de apoio a congelar.
APOIO_2024 = []

MAPAS = {
    '2024': (build_inputs_2024, OUT_MAP_2024, APOIO_2024),
    '2025': (build_inputs_2025, OUT_MAP_2025, APOIO_2025),
}


def normaliza(v):
    """Deixa o valor da célula serializável em JSON, sem perder o tipo lógico."""
    try:
        v = v[0][0]  # a formulas devolve Ranges 2D
    except Exception:
        pass
    if isinstance(v, str):
        return v
    if hasattr(v, 'item'):  # escalar numpy
        v = v.item()
    if isinstance(v, bool):
        return v
    if isinstance(v, (int, float)):
        return int(v) if float(v).is_integer() else v
    # XlError (#VALUE!, #N/A…) e afins: guardados como texto, visíveis no JSON.
    return str(v)


def valor(sol, chave):
    # ADAPTAÇÃO 3: o original trocava KeyError por '<sem célula>' e seguia. Num
    # congelado isso é perigoso — um prefixo errado viraria um esperado.json cheio
    # de '<sem célula>'. Aqui falha alto.
    if chave not in sol:
        raise KeyError('célula ausente na solução da planilha: %s' % chave)
    return normaliza(sol[chave].value)


def main():
    # ADAPTAÇÃO 4: o original lia 'scenarios.json', que não existe com esse nome.
    cenarios = json.load(open(os.path.join(PASTA, 'cenarios.json'), encoding='utf-8'))

    build_inputs, OUT_MAP, APOIO = MAPAS[ANO]

    print('Carregando planilha no motor `formulas` (~16 s)...', file=sys.stderr)
    # Montado UMA vez e reaproveitado em todos os cenários.
    xl = formulas.ExcelModel().loads(SRC).finish()

    saida = []
    for idx, sc in enumerate(cenarios):
        nome = sc.get('_nome', 'cenario#%d' % idx)
        sol = xl.calculate(inputs=build_inputs(sc))
        planilha = {k: valor(sol, r(cel)) for k, cel in OUT_MAP.items()}
        item = {'_nome': nome, 'entrada': sc, 'planilha': planilha}
        # Só 2025 tem o bug G149 que exige células de apoio (ver APOIO_2025 acima);
        # 2024 não tem, então `APOIO_2024` é vazio e nenhum cenário ganha o bloco.
        if APOIO:
            item['apoio'] = {cel: valor(sol, c(cel)) for cel in APOIO}
        saida.append(item)
        print('ok  %s' % nome, file=sys.stderr)

    doc = {
        '_leia': (
            'GERADO por validacao/oraculo.py a partir de validacao/%s/planilha.xlsx. '
            'NÃO edite à mão: rode o oráculo de novo. Consertar este arquivo para um '
            'teste passar apaga a única evidência independente que o motor tem.' % ANO
        ),
        'planilha': ARQUIVO,
        # O teste compara com o sha256 do arquivo na árvore: planilha trocada sem
        # rodar o oráculo de novo reprova, em vez de passar contra o congelado velho.
        'planilhaSha256': hashlib.sha256(open(SRC, 'rb').read()).hexdigest(),
        'celulas': {k: 'RESULTADO!' + cel for k, cel in OUT_MAP.items()},
    }
    # A ordem das chaves no JSON importa para o `git diff --stat` do Step 6: manter
    # `celulasApoio` ANTES de `cenarios`, como no congelado original de 2025.
    if APOIO:
        doc['celulasApoio'] = ['CÁLCULO!' + cel for cel in APOIO]
    doc['cenarios'] = saida
    destino = os.path.join(PASTA, 'esperado.json')
    with open(destino, 'w', encoding='utf-8') as f:
        json.dump(doc, f, ensure_ascii=False, indent=2)
        f.write('\n')
    print('gravado %s (%d cenários)' % (os.path.relpath(destino, os.path.dirname(HERE)), len(saida)),
          file=sys.stderr)


if __name__ == '__main__':
    main()
