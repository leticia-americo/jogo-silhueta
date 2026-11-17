const URL_GEOJSON = "https://raw.githubusercontent.com/datasets/geo-countries/master/data/countries.geojson";

const elementoCarregamento = document.getElementById("estado-carregamento");
const elementoErro = document.getElementById("estado-erro");
const elementoTelaInicial = document.getElementById("tela-inicial");
const elementoMapaMundi = document.getElementById("mapa-mundi");
const elementoTelaJogo = document.getElementById("tela-jogo");
const elementoMapaPais = document.getElementById("mapa-pais");
const elementoMensagemJogo = document.getElementById("mensagem-jogo");
const elementoResposta = document.getElementById("resposta");
const elementoFormResposta = document.getElementById("form-resposta");
const elementoContadorVidas = document.getElementById("contador-vidas");
const elementoPlacar = document.getElementById("placar");
const elementoControlesAjuda = document.getElementById("controles-ajuda");
const elementoDicaAtual = document.getElementById("dica-atual");
const elementoOpcoes = document.getElementById("opcoes");
const elementoModalFim = document.getElementById("modal-fim");
const elementoMensagemModalFim = document.getElementById("mensagem-modal-fim");
const elementoAgradecimento = document.getElementById("agradecimento");
const botaoTentarNovamente = document.getElementById("tentar-novamente");
const botaoComecar = document.getElementById("comecar");
const botaoVoltarInicio = document.getElementById("voltar-inicio");
const botaoReiniciarRodada = document.getElementById("reiniciar-rodada");
const botaoPedirDica = document.getElementById("pedir-dica");
const botaoMostrarAlternativas = document.getElementById("mostrar-alternativas");
const botaoJogarNovamente = document.getElementById("jogar-novamente");
const botaoEncerrarJogo = document.getElementById("encerrar-jogo");

// Guarda os dados em memória para que uma nova tentativa não crie cópias.
let dadosPaises = null;
let paisesParaSortear = [];
let paisAtual = null;
let vidasRestantes = 3;
let rodadaEncerrada = false;
let modoAlternativas = false;
let indiceDica = 0;
let acertos = 0;

function mostrarCarregamento() {
  elementoCarregamento.hidden = false;
  elementoErro.hidden = true;
  elementoTelaInicial.hidden = true;
  elementoTelaJogo.hidden = true;
}

function obterPoligonos(geometria) {
  if (geometria.type === "Polygon") {
    return [geometria.coordinates];
  }
  if (geometria.type === "MultiPolygon") {
    return geometria.coordinates;
  }
  throw new Error(`Tipo de geometria não suportado: ${geometria.type}`);
}

function normalizarLongitude(longitude, referencia) {
  let ajustada = longitude;
  while (ajustada - referencia > 180) ajustada -= 360;
  while (ajustada - referencia < -180) ajustada += 360;
  return ajustada;
}

function calcularCentroLongitude(poligonos) {
  let somaSeno = 0;
  let somaCosseno = 0;

  poligonos.forEach((poligono) => {
    poligono[0].forEach(([longitude]) => {
      const radianos = (longitude * Math.PI) / 180;
      somaSeno += Math.sin(radianos);
      somaCosseno += Math.cos(radianos);
    });
  });

  return (Math.atan2(somaSeno, somaCosseno) * 180) / Math.PI;
}

function ajustarAnel(anel, referencia) {
  let longitudeAnterior = referencia;
  const longitudeInicial = normalizarLongitude(anel[0][0], referencia);

  return anel.map(([longitude, latitude], indice) => {
    const mesmoPontoDeFechamento = indice === anel.length - 1
      && longitude === anel[0][0]
      && latitude === anel[0][1];
    const longitudeAjustada = mesmoPontoDeFechamento
      ? longitudeInicial
      : normalizarLongitude(longitude, longitudeAnterior);
    longitudeAnterior = longitudeAjustada;
    return [longitudeAjustada, latitude];
  });
}

function desenharSilhueta(geometria) {
  const poligonosOriginais = obterPoligonos(geometria);
  const centroLongitude = calcularCentroLongitude(poligonosOriginais);
  const poligonos = poligonosOriginais.map((poligono) => {
    const anelExterior = ajustarAnel(poligono[0], centroLongitude);
    const referenciaAnel = anelExterior[0][0];
    return [
      anelExterior,
      ...poligono.slice(1).map((anel) => ajustarAnel(anel, referenciaAnel)),
    ];
  });

  const pontos = poligonos.flat(2);
  const longitudes = pontos.map(([longitude]) => longitude);
  const latitudes = pontos.map(([, latitude]) => latitude);
  const menorLongitude = Math.min(...longitudes);
  const maiorLongitude = Math.max(...longitudes);
  const menorLatitude = Math.min(...latitudes);
  const maiorLatitude = Math.max(...latitudes);
  const largura = maiorLongitude - menorLongitude || 1;
  const altura = maiorLatitude - menorLatitude || 1;
  const tamanhoSvg = 600;
  const margem = 28;
  const escala = (tamanhoSvg - margem * 2) / Math.max(largura, altura);
  const deslocamentoX = (tamanhoSvg - largura * escala) / 2;
  const deslocamentoY = (tamanhoSvg - altura * escala) / 2;

  const caminhos = poligonos.map((poligono) =>
    poligono.map((anel) => {
      // Reduz a quantidade de pontos mantendo os extremos dos anéis.
      const passo = Math.max(1, Math.ceil(anel.length / 1800));
      const pontosDesenhados = anel.filter((_, indice) =>
        indice % passo === 0 || indice === anel.length - 1
      );
      return pontosDesenhados.map(([longitude, latitude], indice) => {
        const x = (longitude - menorLongitude) * escala + deslocamentoX;
        const y = (maiorLatitude - latitude) * escala + deslocamentoY;
        return `${indice === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
      }).join("") + "Z";
    }).join("")
  ).join("");

  return `<svg viewBox="0 0 ${tamanhoSvg} ${tamanhoSvg}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path d="${caminhos}" fill="currentColor" fill-rule="evenodd" stroke="currentColor" stroke-width="1" stroke-linejoin="round"/>
  </svg>`;
}

function desenharMapaMundi(paises) {
  const largura = 1200;
  const altura = 600;
  const caminhos = [];

  paises.forEach((pais) => {
    if (!pais.geometry || !["Polygon", "MultiPolygon"].includes(pais.geometry.type)) {
      return;
    }

    obterPoligonos(pais.geometry).forEach((poligono) => {
      poligono.forEach((anel) => {
        const passo = Math.max(1, Math.ceil(anel.length / 90));
        const pontos = anel.filter((_, indice) =>
          indice % passo === 0 || indice === anel.length - 1
        );
        if (pontos.length < 3) return;

        const caminho = pontos.map(([longitude, latitude], indice) => {
          const x = ((longitude + 180) / 360) * largura;
          const y = ((90 - latitude) / 180) * altura;
          return `${indice === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
        }).join("") + "Z";
        caminhos.push(caminho);
      });
    });
  });

  if (caminhos.length === 0) {
    throw new Error("Não foi possível desenhar os países do mapa-múndi.");
  }

  return `<svg viewBox="0 0 ${largura} ${altura}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path d="${caminhos.join("")}" fill="currentColor" fill-rule="evenodd"/>
  </svg>`;
}

function atualizarPlacar() {
  elementoPlacar.textContent = `Acertos: ${acertos}`;
}

function comecarJogo() {
  acertos = 0;
  atualizarPlacar();
  elementoTelaInicial.hidden = true;
  iniciarRodada();
}

function voltarParaInicio() {
  elementoTelaJogo.hidden = true;
  elementoTelaInicial.hidden = false;
  botaoComecar.focus();
}

function jogarOutraRodada() {
  elementoModalFim.close();
  iniciarRodada();
}

function encerrarJogo() {
  elementoModalFim.close();
  elementoTelaJogo.hidden = true;
  elementoTelaInicial.hidden = true;
  elementoAgradecimento.hidden = false;

  setTimeout(() => {
    elementoAgradecimento.hidden = true;
    elementoTelaInicial.hidden = false;
    botaoComecar.focus();
  }, 2500);
}

function nomeDoPais(pais) {
  const codigo = pais.properties?.["ISO3166-1-Alpha-3"];
  const registro = NOMES_PT[codigo];
  const codigoCurto = pais.properties?.["ISO3166-1-Alpha-2"];
  if (codigoCurto && typeof Intl.DisplayNames === "function") {
    return new Intl.DisplayNames(["pt-BR"], { type: "region" }).of(codigoCurto)
      || registro.nome;
  }
  return registro.nome;
}

function normalizarResposta(texto) {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/\s+/g, " ")
    .trim();
}

function respostaCorreta(pais, resposta) {
  const codigo = pais.properties["ISO3166-1-Alpha-3"];
  const registro = NOMES_PT[codigo];
  const aceitos = [nomeDoPais(pais), registro.nome, ...registro.apelidos, pais.properties.name];
  const respostaNormalizada = normalizarResposta(resposta);
  return aceitos.some((nome) => normalizarResposta(nome) === respostaNormalizada);
}

function sortearPais() {
  const candidatos = dadosPaises.filter((pais) =>
    /^[A-Z]{3}$/.test(pais.properties?.["ISO3166-1-Alpha-3"] || "")
    && pais.properties["ISO3166-1-Alpha-3"] !== "ATA"
    && pais.geometry
    && ["Polygon", "MultiPolygon"].includes(pais.geometry.type)
    && NOMES_PT[pais.properties["ISO3166-1-Alpha-3"]]
    && DICAS[pais.properties["ISO3166-1-Alpha-3"]]?.length
  );
  if (candidatos.length === 0) {
    throw new Error("Não há países com nome, dica e geometria válidos para sortear.");
  }

  if (paisesParaSortear.length === 0) {
    paisesParaSortear = candidatos.filter((pais) =>
      pais.properties["ISO3166-1-Alpha-3"] !== paisAtual?.properties["ISO3166-1-Alpha-3"]
    );
    if (paisesParaSortear.length === 0) {
      paisesParaSortear = candidatos.slice();
    }
  }

  const indice = Math.floor(Math.random() * paisesParaSortear.length);
  return paisesParaSortear.splice(indice, 1)[0];
}

function atualizarVidas() {
  const avioes = document.querySelectorAll(".icone-vida");
  avioes.forEach((aviao, indice) => {
    const disponivel = indice < vidasRestantes;
    aviao.classList.toggle("perdida", !disponivel);
    aviao.setAttribute("aria-label", `Vida ${indice + 1} ${disponivel ? "disponível" : "perdida"}`);
  });
  elementoContadorVidas.textContent = `${vidasRestantes} ${vidasRestantes === 1 ? "vida" : "vidas"}`;
}

function iniciarRodada() {
  paisAtual = sortearPais();
  vidasRestantes = 3;
  rodadaEncerrada = false;
  modoAlternativas = false;
  indiceDica = 0;
  atualizarVidas();
  elementoMensagemJogo.textContent = "";
  elementoMensagemJogo.className = "mensagem-jogo";
  elementoResposta.value = "";
  elementoResposta.disabled = false;
  elementoFormResposta.querySelector("button").disabled = false;
  elementoFormResposta.hidden = false;
  elementoControlesAjuda.hidden = false;
  elementoDicaAtual.hidden = true;
  elementoDicaAtual.textContent = "";
  elementoOpcoes.innerHTML = "";
  elementoOpcoes.classList.add("hidden");
  botaoPedirDica.disabled = false;
  botaoMostrarAlternativas.disabled = false;
  elementoMapaPais.innerHTML = desenharSilhueta(paisAtual.geometry);
  elementoMapaPais.setAttribute("aria-label", "Silhueta do país para adivinhar");
  elementoTelaInicial.hidden = true;
  elementoTelaJogo.hidden = false;
  elementoResposta.focus();
}

function terminarRodada(mensagem, tipo) {
  rodadaEncerrada = true;
  if (tipo === "sucesso") {
    acertos += 1;
    atualizarPlacar();
  }
  elementoMensagemJogo.textContent = mensagem;
  elementoMensagemJogo.className = `mensagem-jogo ${tipo}`;
  elementoMensagemModalFim.textContent = `${mensagem} Acertos até agora: ${acertos}.`;
  elementoMensagemModalFim.className = `mensagem-modal-fim ${tipo}`;
  elementoResposta.disabled = true;
  elementoFormResposta.querySelector("button").disabled = true;
  botaoPedirDica.disabled = true;
  botaoMostrarAlternativas.disabled = true;
  elementoOpcoes.querySelectorAll("button").forEach((botao) => {
    botao.disabled = true;
  });
  elementoModalFim.showModal();
}

function perderVida() {
  if (rodadaEncerrada || vidasRestantes === 0) return;
  vidasRestantes -= 1;
  atualizarVidas();

  if (vidasRestantes === 0) {
    terminarRodada(`Suas vidas acabaram. O país era ${nomeDoPais(paisAtual)}.`, "erro");
    return;
  }
  elementoMensagemJogo.textContent = `Não é esse. Você ainda tem ${vidasRestantes} ${vidasRestantes === 1 ? "vida" : "vidas"}.`;
  elementoMensagemJogo.className = "mensagem-jogo erro";
}

function verificarResposta(evento) {
  evento.preventDefault();
  if (rodadaEncerrada || !paisAtual) return;

  if (respostaCorreta(paisAtual, elementoResposta.value)) {
    terminarRodada(`Acertou! O país era ${nomeDoPais(paisAtual)}.`, "sucesso");
    return;
  }
  perderVida();
  if (vidasRestantes > 0) elementoResposta.select();
}

function mostrarDica() {
  if (!paisAtual || rodadaEncerrada) return;
  const codigo = paisAtual.properties["ISO3166-1-Alpha-3"];
  const dicas = DICAS[codigo];
  if (indiceDica >= dicas.length) return;

  elementoDicaAtual.textContent = `Dica: ${dicas[indiceDica]}`;
  elementoDicaAtual.hidden = false;
  indiceDica += 1;
  botaoPedirDica.disabled = indiceDica >= dicas.length;
}

function embaralhar(lista) {
  for (let indice = lista.length - 1; indice > 0; indice -= 1) {
    const outroIndice = Math.floor(Math.random() * (indice + 1));
    [lista[indice], lista[outroIndice]] = [lista[outroIndice], lista[indice]];
  }
  return lista;
}

function paisesParaAlternativas() {
  const codigoAtual = paisAtual.properties["ISO3166-1-Alpha-3"];
  const registroAtual = NOMES_PT[codigoAtual];
  const outrasRespostas = dadosPaises.filter((pais) => {
    const codigo = pais.properties?.["ISO3166-1-Alpha-3"];
    return codigo !== codigoAtual
      && codigo !== "ATA"
      && NOMES_PT[codigo]
      && DICAS[codigo]?.length
      && pais.geometry
      && ["Polygon", "MultiPolygon"].includes(pais.geometry.type);
  });

  const mesmaSubregiao = outrasRespostas.filter((pais) =>
    NOMES_PT[pais.properties["ISO3166-1-Alpha-3"]].subregiao === registroAtual.subregiao
  );
  const mesmoContinente = outrasRespostas.filter((pais) =>
    NOMES_PT[pais.properties["ISO3166-1-Alpha-3"]].continente === registroAtual.continente
  );
  const candidatas = mesmaSubregiao.length >= 3
    ? mesmaSubregiao
    : mesmoContinente.length >= 3 ? mesmoContinente : outrasRespostas;
  return embaralhar(candidatas.slice()).slice(0, 3);
}

function verificarAlternativa(paisEscolhido, botao) {
  if (rodadaEncerrada) return;
  if (paisEscolhido === paisAtual) {
    botao.classList.add("correta");
    terminarRodada(`Acertou! O país era ${nomeDoPais(paisAtual)}.`, "sucesso");
    return;
  }

  botao.disabled = true;
  botao.classList.add("errada");
  perderVida();
}

function mostrarAlternativas() {
  if (!paisAtual || rodadaEncerrada || modoAlternativas) return;

  modoAlternativas = true;
  elementoFormResposta.hidden = true;
  botaoMostrarAlternativas.disabled = true;

  const respostas = embaralhar([...paisesParaAlternativas(), paisAtual]);
  elementoOpcoes.innerHTML = "";
  respostas.forEach((pais) => {
    const botao = document.createElement("button");
    botao.type = "button";
    botao.className = "opcao-btn";
    botao.textContent = nomeDoPais(pais);
    botao.addEventListener("click", () => verificarAlternativa(pais, botao));
    elementoOpcoes.appendChild(botao);
  });
  elementoOpcoes.classList.remove("hidden");
  elementoOpcoes.querySelector("button").focus();
}

async function carregarPaises() {
  mostrarCarregamento();

  try {
    if (!dadosPaises) {
      const resposta = await fetch(URL_GEOJSON);
      if (!resposta.ok) {
        throw new Error(`Falha HTTP ${resposta.status} ao carregar o GeoJSON.`);
      }

      const geojson = await resposta.json();
      if (!Array.isArray(geojson.features) || geojson.features.length === 0) {
        throw new Error("O GeoJSON não contém países.");
      }
      dadosPaises = geojson.features;
    }

    elementoMapaMundi.innerHTML = desenharMapaMundi(dadosPaises);
    elementoCarregamento.hidden = true;
    elementoErro.hidden = true;
    elementoTelaInicial.hidden = false;
  } catch (erro) {
    console.error("Não foi possível carregar os países:", erro);
    elementoCarregamento.hidden = true;
    elementoTelaInicial.hidden = true;
    elementoTelaJogo.hidden = true;
    elementoErro.hidden = false;
  }
}

botaoTentarNovamente.addEventListener("click", carregarPaises);
botaoComecar.addEventListener("click", comecarJogo);
botaoVoltarInicio.addEventListener("click", voltarParaInicio);
botaoReiniciarRodada.addEventListener("click", iniciarRodada);
botaoPedirDica.addEventListener("click", mostrarDica);
botaoMostrarAlternativas.addEventListener("click", mostrarAlternativas);
botaoJogarNovamente.addEventListener("click", jogarOutraRodada);
botaoEncerrarJogo.addEventListener("click", encerrarJogo);
elementoModalFim.addEventListener("cancel", (evento) => evento.preventDefault());
elementoFormResposta.addEventListener("submit", verificarResposta);
carregarPaises();
