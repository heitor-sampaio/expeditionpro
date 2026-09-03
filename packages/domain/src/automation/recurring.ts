import { ESPERA_MINIMA_MIN } from './interpreter.js';

/**
 * AU-17 — o gatilho que roda **de tempos em tempos**, sem entidade nenhuma por trás.
 *
 * "A cada seis horas, avise a equipe do que está pendente" não pende de mensagem, inscrição
 * nem saída: pende só do relógio. E é justamente por isso que ele não é um despertador.
 *
 * **A janela substitui o estado.** Em vez de guardar "quando disparou pela última vez" — que
 * seria escrever no desenho a cada passada, e que se perde num restauro de banco —, o tempo é
 * dividido em fatias do tamanho do intervalo, e a fatia vira a chave de idempotência. Duas
 * varreduras na mesma fatia calculam a mesma chave, e a unique `(tenant, automação, chave)`
 * deixa só a primeira passar. Sem estado, sem relógio preciso, e imune a processo que caiu.
 *
 * O preço é que "a cada seis horas" conta a partir do relógio, não de quando alguém ligou a
 * automação: as fatias caem em 00:00, 06:00, 12:00 e 18:00. É previsível, que é o que importa
 * em algo que roda sem ninguém olhando.
 */

/** O mesmo piso da espera, e pela mesma razão: a varredura de rede é de um minuto. */
export const INTERVALO_MINIMO_MIN = ESPERA_MINIMA_MIN;

const POR_UNIDADE: Record<string, number> = { minutes: 1, hours: 60, days: 1440 };

/**
 * O intervalo pedido, em minutos, **sem** o piso. É o que o validador de grafo usa para
 * recusar "a cada 30 segundos" ao salvar; quem aplica o piso é `janelaDe`. Os dois lendo a
 * mesma conversão é o que impede a tela recusar um número que a execução aceitaria.
 */
export function intervaloEmMinutos(config: Record<string, unknown>): number {
  const bruto = Number(config['amount']);
  const quantidade = Number.isFinite(bruto) && bruto > 0 ? bruto : 0;
  return quantidade * (POR_UNIDADE[String(config['unit'])] ?? 1);
}

/**
 * Em que fatia do tempo `agora` cai. Duas varreduras na mesma fatia devolvem o mesmo número —
 * e é esse número, virando chave de idempotência, que garante um disparo só.
 */
export function janelaDe(config: Record<string, unknown>, agora: Date): number {
  const minutos = Math.max(intervaloEmMinutos(config), INTERVALO_MINIMO_MIN);
  return Math.floor(agora.getTime() / (minutos * 60_000));
}
