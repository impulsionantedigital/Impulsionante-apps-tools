#!/usr/bin/env python3
"""Valida o motor JS contra a planilha original usando a lib `formulas` como oráculo."""
import json, subprocess, warnings, sys, os
warnings.filterwarnings("ignore")
import formulas

SRC = '/Users/sigapavon/Downloads/Planilha calculadora de Indulto e Comutação 2025 - Original.xlsx'
HERE = os.path.dirname(os.path.abspath(__file__))
PFX = "'[Planilha calculadora de Indulto e Comutação 2025 - Original.xlsx]{sheet}'!{cell}"

def q(cell):  # célula do Questionario
    return PFX.format(sheet='QUESTIONARIO', cell=cell)
def r(cell):  # célula do Resultado
    return PFX.format(sheet='RESULTADO', cell=cell)

# mapa: campo do motor -> como preencher as células do Questionario
def build_inputs(s):
    inp = {}
    def tempo(prefix, campo):
        t = s.get(campo) or {}
        inp[q(prefix[0])] = t.get('anos', 0)
        inp[q(prefix[1])] = t.get('meses', 0)
        inp[q(prefix[2])] = t.get('dias', 0)
    tempo(('C8','D8','E8'), 'penaImpeditiva')
    tempo(('C9','D9','E9'), 'penaViolencia')
    tempo(('C10','D10','E10'), 'penaSemViolencia')
    tempo(('C15','D15','E15'), 'penaCumpridaSEEU')
    tempo(('C16','D16','E16'), 'penaCumpridaNaoSEEU')
    # tempo semiaberto/aberto — a planilha guarda como texto; formulas lida com número
    for pfx, campo in [(('C40','D40','E40'),'tempoSemiaberto'), (('C43','D43','E43'),'tempoSemiabertoAberto')]:
        t = s.get(campo) or {}
        inp[q(pfx[0])] = t.get('anos', 0)
        inp[q(pfx[1])] = t.get('meses', 0)
        inp[q(pfx[2])] = t.get('dias', 0)
    inp[q('E31')] = s.get('sexo', 'MASCULINO')
    # datas -> serial Excel
    import datetime
    def serial(dstr):
        y,m,d = map(int, dstr.split('-'))
        return (datetime.date(y,m,d) - datetime.date(1899,12,30)).days
    inp[q('E33')] = serial(s.get('dataNascimento','1980-01-01'))
    inp[q('E53')] = serial(s.get('dataUltimaPrisao','2015-01-01'))
    inp[q('E35')] = s.get('reincidente','NÃO')
    inp[q('E37')] = s.get('regime','FECHADO')
    inp[q('E45')] = s.get('livramentoCondicional','NÃO')
    inp[q('E47')] = s.get('monitoramentoSV56','NÃO')
    inp[q('E49')] = s.get('programaEgressos','NÃO')
    inp[q('E51')] = s.get('justicaRestaurativa','NÃO')
    inp[q('E55')] = s.get('periodoLiberdade2Anos','NÃO')
    inp[q('E57')] = s.get('faltaGraveAno','NÃO')
    inp[q('E59')] = s.get('faltaGraveExecucao','NÃO')
    inp[q('E61')] = s.get('diasRemicao',0)
    inp[q('E63')] = s.get('colaboracaoPremiada','NÃO')
    inp[q('E65')] = s.get('faccao','NÃO')
    inp[q('E67')] = s.get('rdd','NÃO')
    inp[q('E69')] = s.get('presidioFederal','NÃO')
    inp[q('E71')] = s.get('deficiencia','NÃO')
    inp[q('E73')] = s.get('condicoesGravesSaude','NÃO')
    inp[q('E75')] = s.get('gestante','NÃO')
    inp[q('E77')] = s.get('filhoAte16','NÃO')
    inp[q('E79')] = s.get('filhoDeficiencia','NÃO')
    inp[q('E81')] = s.get('filhoDeficienciaCuidados','NÃO')
    inp[q('E83')] = s.get('filhoDoencaCronica','NÃO')
    inp[q('E85')] = s.get('filhoDoencaCronicaCuidados','NÃO')
    inp[q('E87')] = s.get('homemUnicoResponsavel','NÃO')
    inp[q('E89')] = s.get('imprescindivelCrianca','NÃO')
    inp[q('E91')] = s.get('avoNetos','NÃO')
    inp[q('E93')] = s.get('saidasOuTrabalhoExterno','NÃO')
    inp[q('E95')] = s.get('estudo','NÃO')
    inp[q('E97')] = s.get('concluiuCurso','NÃO')
    inp[q('E99')] = s.get('crimeContraCrianca','NÃO')
    inp[q('E101')] = s.get('respondendoOutroCrimeViolento','NÃO')
    inp[q('E103')] = s.get('penasSubstituidas','NÃO')
    inp[q('E105')] = s.get('condenacaoAberto','NÃO')
    inp[q('E107')] = s.get('crimePatrimonio','NÃO')
    inp[q('E109')] = s.get('reparouDano','NÃO')
    inp[q('E111')] = s.get('valorBemSalarioMinimo','NÃO')
    inp[q('E113')] = s.get('cumpriu23ImpeditivoDataFato','SIM')
    inp[q('E115')] = s.get('cumpriuFracaoViolenciaDataFato','SIM')
    inp[q('E117')] = s.get('valorMulta',0)
    inp[q('E119')] = s.get('hipossuficiente','NÃO')
    return inp

# células de saída na aba Resultado -> chave do motor
OUT_MAP = {
    'art9_I.geral':'D9','art9_I.especial':'E9',
    'art9_II.geral':'D11','art9_II.especial':'E11',
    'art9_III.geral':'D13','art9_III.especial':'E13',
    'art9_IV.geral':'D15','art9_IV.especial':'E15',
    'art9_V.geral':'D17','art9_V.especial':'E17',
    'art9_VI.geral':'D19','art9_VI.especial':'E19',
    'art9_VII.geral':'D21','art9_VII.especial':'E21',
    'art9_VIII.geral':'D23','art9_VIII.especial':'E23',
    'art9_IX.geral':'D25','art9_IX.especial':'E25',
    'art9_X.geral':'D27','art9_X.especial':'E27',
    'art9_XI.geral':'D29','art9_XI.especial':'E29',
    'art9_XII.geral':'D31',
    'art9_XIII.geral':'D33',
    'art9_XIV.geral':'D35',
    'art9_XV.geral':'D37',
    'art9_XVI.geral':'D39',
    'art10.geral':'D41',
    'art12.geral':'D43',
    'art11_I.geral':'D47','art11_I.comutacaoTxt':'E47','art11_I.penaAposTxt':'E48',
    'art11_II.geral':'D50','art11_II.comutacaoTxt':'E50','art11_II.penaAposTxt':'E51',
    'art11_III.geral':'D53','art11_III.comutacaoTxt':'E53','art11_III.penaAposTxt':'E54',
    'art13.geral':'D56','art13.comutacaoTxt':'E56','art13.penaAposTxt':'E57',
    'art13_4.geral':'D59','art13_4.comutacaoTxt':'E59','art13_4.penaAposTxt':'E60',
}

SCENARIOS = json.load(open(os.path.join(HERE,'scenarios.json'), encoding='utf-8'))

print("Carregando planilha no motor `formulas`...", file=sys.stderr)
xl = formulas.ExcelModel().loads(SRC).finish()

def sheet_val(sol, cell_key):
    v = sol[cell_key].value
    try:
        return v[0][0]
    except Exception:
        return v

import re
def dur_dias(txt):
    """converte 'X anos Y meses Z dias' em dias (base 360/30); None se não for duração."""
    m = re.match(r'^-?\s*(\d+)\s+anos?\s+(\d+)\s+meses?\s+(\d+)\s+dias?$', str(txt).strip())
    if not m: return None
    a,me,d = map(int, m.groups())
    return a*360 + me*30 + d

def equivalentes(pn, mn):
    if pn == mn: return True
    # durações: iguais se representam o mesmo total de dias (tolera arredondamento de 1 dia)
    dp, dm = dur_dias(pn), dur_dias(mn)
    if dp is not None and dm is not None:
        return abs(dp - dm) <= 1
    return False

total_mismatch = 0
desvios_documentados = 0
for idx, sc in enumerate(SCENARIOS):
    name = sc.get('_nome', f'cenario#{idx}')
    inputs = build_inputs(sc)
    sol = xl.calculate(inputs=inputs)
    # motor JS
    js = json.loads(subprocess.check_output(['node', os.path.join(HERE,'run_engine.js'), json.dumps(sc)]).decode())
    art13_4_geral = str(sheet_val(sol, r(OUT_MAP['art13_4.geral']))).strip()
    diffs = []
    for key, cell in OUT_MAP.items():
        try:
            planilha = sheet_val(sol, r(cell))
        except KeyError:
            planilha = '<sem célula>'
        motor = js.get(key, '<ausente>')
        pn = str(planilha).strip()
        mn = str(motor).strip()
        # DESVIO DOCUMENTADO: bug G149 (§4º mostra valor mesmo sem preencher).
        # Motor corrige: só mostra comutação quando o §4º de fato preenche.
        if key in ('art13_4.comutacaoTxt','art13_4.penaAposTxt') and \
           art13_4_geral == 'Não preenche os requisitos' and mn == 'Sem Comutação':
            desvios_documentados += 1
            continue
        if not equivalentes(pn, mn):
            diffs.append((key, cell, pn, mn))
    if diffs:
        total_mismatch += len(diffs)
        print(f"\n=== {name}: {len(diffs)} divergência(s) ===")
        for key, cell, pn, mn in diffs:
            print(f"  {key} (Resultado!{cell})\n     planilha: {pn!r}\n     motor:    {mn!r}")
    else:
        print(f"OK  {name}: todos os {len(OUT_MAP)} outputs conferem")

print(f"\n>>> Total de divergências reais: {total_mismatch}")
print(f">>> Desvios documentados (fix bug §4º G149): {desvios_documentados}")
sys.exit(1 if total_mismatch else 0)
