// Runner: lê um cenário JSON (arg 1) e imprime o resultado do motor em JSON.
const M = require('../src/engine.js');
const scenario = JSON.parse(process.argv[2]);
const out = M.calcular(scenario);
// achata para comparação com a planilha
const flat = {};
for (const k in out.incisos) {
  const v = out.incisos[k];
  flat[k + '.geral'] = v.geral || v.situacao;
  if ('especial' in v) flat[k + '.especial'] = v.especial;
  if ('comutacaoTxt' in v) flat[k + '.comutacaoTxt'] = v.comutacaoTxt;
  if ('penaAposTxt' in v) flat[k + '.penaAposTxt'] = v.penaAposTxt;
}
process.stdout.write(JSON.stringify(flat));
