import { describe, it, expect } from 'vitest';
import { VEHICLE_CATALOG, ITINERARIES } from './catalog.js';

/**
 * Teste de contrato do catálogo de seed contra o Anexo A do PRD.
 *
 * As linhas abaixo espelham a TABELA do Anexo A verbatim (sem os marcadores `+` e o
 * negrito), fáceis de conferir a olho contra o PRD. O seed tem que reproduzi-las.
 *
 * Reconciliação: a tabela lista 26 marcas e 107 modelos. A linha "Totais: 27 marcas,
 * 106 modelos" do PRD está inconsistente com a própria tabela — a tabela é a fonte.
 */
const ANEXO_A_ROWS: readonly (readonly [string, string])[] = [
  ['Agrale', 'Marruá AM100, Marruá AM200'],
  ['BYD', 'Shark'],
  ['CBT', 'Javali'],
  [
    'Chevrolet',
    'S10, Trailblazer, Blazer, Tracker, Equinox, Silverado 1500, Colorado, D-20, Bonanza, Veraneio',
  ],
  ['Engesa', 'Engesa 4, Engesa 6'],
  ['Fiat', 'Toro, Titano'],
  ['Ford', 'Ranger, Bronco, Bronco Sport, Maverick, Explorer, F-150, F-250, Rural, F-75'],
  ['Gurgel', 'X-12, Xavante, Carajás'],
  ['GWM', 'Haval H6, Tank 300, Tank 500, Poer P30'],
  ['Hyundai', 'Santa Fé, Tucson, Galloper'],
  [
    'Jeep',
    'Willys, Compass, Renegade, Commander, Grand Cherokee, Cherokee, Cherokee Sport XJ, Wrangler, Gladiator',
  ],
  ['JPX', 'Montez'],
  ['KIA', 'Sorento, Mohave, Sportage'],
  ['Lada', 'Niva'],
  ['Land Rover', 'Defender 90, Defender 110, Defender 130, Discovery, Discovery Sport, Freelander'],
  ['Mercedes-Benz', 'GLB 200, Classe G, GLE'],
  [
    'Mitsubishi',
    'L200 Triton, Triton, Triton Sport, Pajero Full, Pajero Dakar, Pajero Sport, Pajero TR4, ASX, Outlander, Eclipse Cross',
  ],
  ['Nissan', 'Frontier, X-Terra, Pathfinder'],
  ['RAM', '1500, 2500, 3500, Rampage, Dakota'],
  ['Range Rover', 'Range Rover, Range Rover Sport, Evoque, Velar'],
  ['Renault', 'Duster, Oroch, Koleos'],
  ['Ssangyong', 'Actyon Sports, Korando, Rexton'],
  ['Suzuki', 'Jimny, Jimny Sierra, Jimny 4Sport, Vitara, Grand Vitara, SX4, Samurai'],
  ['Toyota', 'Hilux, SW4, Bandeirante, Land Cruiser, Land Cruiser Prado, RAV4'],
  ['Troller', 'T4, TX4, RF'],
  ['Volkswagen', 'Amarok, Tiguan, Touareg'],
];

const EXPECTED: Record<string, string[]> = Object.fromEntries(
  ANEXO_A_ROWS.map(([brand, models]) => [brand, models.split(', ')]),
);

describe('Anexo A: catálogo de veículos do seed', () => {
  it('reproduz a tabela do Anexo A exatamente (marca a marca, modelo a modelo)', () => {
    expect(VEHICLE_CATALOG).toEqual(EXPECTED);
  });

  it('tem 26 marcas e 107 modelos — a tabela, não a linha de Totais (27/106) do PRD', () => {
    const brands = Object.keys(VEHICLE_CATALOG);
    const models = Object.values(VEHICLE_CATALOG).flat();
    expect(brands).toHaveLength(26);
    expect(models).toHaveLength(107);
  });

  it('não tem modelo duplicado dentro de uma marca', () => {
    for (const [brand, models] of Object.entries(VEHICLE_CATALOG)) {
      expect(new Set(models).size, `duplicado em ${brand}`).toBe(models.length);
    }
  });

  it('aplica as normalizações de grafia das notas do Anexo A', () => {
    expect(VEHICLE_CATALOG['Jeep']).toContain('Willys'); // Willys → Jeep
    expect(VEHICLE_CATALOG['Jeep']).toContain('Grand Cherokee'); // Gran → Grand
    expect(VEHICLE_CATALOG['Suzuki']).toContain('Grand Vitara'); // Gran → Grand
    expect(VEHICLE_CATALOG['Ford']).toEqual(
      expect.arrayContaining(['F-150', 'F-250', 'Rural', 'F-75']),
    );
    expect(VEHICLE_CATALOG['GWM']).toContain('Haval H6'); // Haval → Haval H6
    expect(VEHICLE_CATALOG['BYD']).toContain('Shark'); // Shark em BYD, não GWM
    expect(VEHICLE_CATALOG['Mercedes-Benz']).toBeDefined(); // Mercedes Benz → Mercedes-Benz
  });
});

describe('Anexo B: roteiros do seed', () => {
  it('tem os 15 roteiros, incluindo "Personalizado" (custom)', () => {
    expect(ITINERARIES).toHaveLength(15);
    expect(ITINERARIES).toContain('Coxilha Rica');
    expect(ITINERARIES).toContain('Personalizado');
    expect(ITINERARIES.every((name) => name.trim().length > 0)).toBe(true);
  });
});
