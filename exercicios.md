# Guia de Preparação EPSO — Raciocínio Numérico (AD)

Este documento contém estratégias cruciais para acelerar o teu cálculo mental, atalhos matemáticos para o teste EPSO e um conjunto de **15 exercícios práticos** inspirados nas provas reais, organizados com as respetivas resoluções detalhadas.

## 1. Dicas e Atalhos de Cálculo Rápido

Nas provas da EPSO tens, em média, **2 minutos por pergunta**. O objetivo não é fazer contas exatas no papel, mas sim simplificar expressões matemáticas e usar atalhos.

### A. Método do Fator Multiplicativo Encadeado

Em perguntas sobre variações percentuais acumuladas (ex.: variação das despesas públicas de I&D entre dois anos quando o PIB também varia), **nunca** meças o valor absoluto intermédio.

Para uma grandeza $Y = \text{PIB} \times \%_{\text{I\&D}} \times \%_{\text{Público}}$, o fator de variação total ($F$) é simplesmente:  


$$F = F_{\text{PIB}} \times \left( \frac{\%_{\text{I\&D, ano2}}}{\%_{\text{I\&D, ano1}}} \right) \times \left( \frac{\%_{\text{Público, ano2}}}{\%_{\text{Público, ano1}}} \right)$$

- **Aumento percentual:** $(F - 1) \times 100\%$

### B. Aproximações e Arredondamento Estratégico

Olha para as opções de resposta **antes** de calcular:

- **Opções muito espaçadas** (ex.: $1/3$, $2/3$, $3/2$, $3/1$): Arredonda números complexos para 2 algarismos significativos.
  - Exemplo: $\frac{41.100}{0,0245} \approx \frac{41.000}{0,025} = 41.000 \times 40 = 1.640.000$.
- **Opções muito próximas** (ex.: $1,21\%$, $1,31\%$, $1,41\%$): Requer precisão de 3 a 4 algarismos significativos.

### C. Regra Prática para Identificar "Impossível Responder"

A opção *"Impossível responder"* só é a correta se:

1. Faltar um dado populacional ao passar de um indicador *per capita* para um valor total.
2. Faltar a variação percentual do valor de base (ex.: variação do PIB) quando apenas são fornecidas percentagens relativas na tabela.

## 2. Tabelas de Suporte

### Tabela 1: Indicadores Económicos e de Inovação (2015 - 2018)

| País         | Despesas I&D (% do PIB) [2015] | Despesas I&D (% do PIB) [2018] | % I&D Financiamento Público [2015] | % I&D Financiamento Público [2018] | Despesas I&D (Milhões de EUR) [2015] | PIB per capita (EUR) [2015] |
| ------------ | ------------------------------ | ------------------------------ | ---------------------------------- | ---------------------------------- | ------------------------------------ | --------------------------- |
| **Espanha**  | $1,22\%$                       | $1,24\%$                       | $41,5\%$                           | $39,8\%$                           | $13.250$                             | $23.200$                    |
| **Suécia**   | $3,26\%$                       | $3,32\%$                       | $27,8\%$                           | $28,5\%$                           | $14.800$                             | $45.100$                    |
| **Itália**   | $1,34\%$                       | $1,39\%$                       | $38,2\%$                           | $37,1\%$                           | $22.100$                             | $27.500$                    |
| **Polónia**  | $1,00\%$                       | $1,21\%$                       | $44,0\%$                           | $38,0\%$                           | $4.750$                              | $11.200$                    |
| **Alemanha** | $2,88\%$                       | $3,13\%$                       | $31,1\%$                           | $30,4\%$                           | $88.800$                             | $37.100$                    |

### Tabela 2: Demografia e Urbanização Global (2020)

| Continente           | Superfície ($\text{km}^2$) | População (milhões) | % População Urbana | Número de Países |
| -------------------- | -------------------------- | ------------------- | ------------------ | ---------------- |
| **África**           | $30.065.000$               | $1.340,5$           | $43\%$             | $54$             |
| **Ásia**             | $44.579.000$               | $4.641,0$           | $51\%$             | $49$             |
| **Europa**           | $10.180.000$               | $747,5$             | $75\%$             | $44$             |
| **América do Norte** | $24.709.000$               | $592,0$             | $82\%$             | $23$             |
| **América do Sul**   | $17.840.000$               | $430,8$             | $83\%$             | $12$             |

### Tabela 3: Consumo de Energia na UE por Fonte (2010 vs 2020)

| Fonte de Energia | Consumo 2010 (Mtoe) | Consumo 2020 (Mtoe) | % Importada (2020) | Custo Médio (€/Mtoe) [2020] |
| ---------------- | ------------------- | ------------------- | ------------------ | --------------------------- |
| **Petróleo**     | $650$               | $520$               | $95\%$             | $450.000$                   |
| **Gás Natural**  | $430$               | $390$               | $84\%$             | $320.000$                   |
| **Renováveis**   | $180$               | $290$               | $5\%$              | $180.000$                   |
| **Nuclear**      | $230$               | $180$               | $0\%$              | $210.000$                   |
| **Carvão**       | $280$               | $150$               | $60\%$             | $150.000$                   |

## 3. Conjunto de 15 Exercícios Práticos

### Exercício 1: Rácios de PIB

*(Com base na Tabela 1)*  
**Em 2015, qual era aproximadamente o rácio entre o PIB da Suécia e o da Espanha?**

- A) $1/3$
- B) $1/2$
- C) $2/3$
- D) $3/2$
- E) Impossível responder

### Exercício 2: Variação Percentual Acumulada

*(Com base na Tabela 1)*  
**Sabendo que o PIB da Espanha aumentou** $8\%$ **entre 2015 e 2018, qual foi a variação percentual aproximada das despesas públicas de I&D em Espanha durante este período?**

- A) $3,52\%$
- B) $5,32\%$
- C) $8,00\%$
- D) $9,76\%$
- E) Impossível responder

### Exercício 3: Cálculo Populacional / Per Capita

*(Com base na Tabela 1)*  
**Com base nos dados de 2015, qual era a população aproximada da Polónia?**

- A) $32,1$ milhões
- B) $37,9$ milhões
- C) $42,4$ milhões
- D) $47,5$ milhões
- E) Impossível responder

### Exercício 4: Leitura Direta de Superfície Combinada

*(Com base na Tabela 2)*  
**Qual é a superfície total (em** $\text{km}^2$**) da Europa e da África em conjunto?**

- A) $40.245.000$
- B) $40.825.000$
- C) $41.245.000$
- D) $54.759.000$
- E) Impossível responder

### Exercício 5: Cálculo de População Urbana Absoluta

*(Com base na Tabela 2)*  
**Aproximadamente, quantos milhões de pessoas viviam em áreas urbanas na América do Sul em 2020?**

- A) $322,4$ milhões
- B) $357,6$ milhões
- C) $382,1$ milhões
- D) $430,8$ milhões
- E) Impossível responder

### Exercício 6: Variação de Despesas Totais sem Dados Suficientes

*(Com base na Tabela 1)*  
**Qual foi a variação percentual das despesas de I&D da Itália entre 2015 e 2018?**

- A) $3,73\%$
- B) $5,12\%$
- C) $7,85\%$
- D) $11,20\%$
- E) Impossível responder

### Exercício 7: Densidade Populacional Relativa

*(Com base na Tabela 2)*  
**Qual dos seguintes continentes apresentava a maior densidade populacional (habitantes por** $\text{km}^2$**) em 2020?**

- A) África
- B) Ásia
- C) Europa
- D) América do Norte
- E) América do Sul

### Exercício 8: Rácio entre PIB da Alemanha e da Itália

*(Com base na Tabela 1)*  
**Em 2015, qual era aproximadamente o rácio entre o PIB da Alemanha e o da Itália?**

- A) $1/2$
- B) $3/2$
- C) $15/8$
- D) $3/1$
- E) Impossível responder

### Exercício 9: Variação das Despesas de I&D da Alemanha

*(Com base na Tabela 1)*  
**Sabendo que o PIB da Alemanha cresceu** $6\%$ **entre 2015 e 2018, qual foi o aumento percentual aproximado do valor total de despesas de I&D na Alemanha nesse período?**

- A) $8,2\%$
- B) $11,5\%$
- C) $15,2\%$
- D) $18,7\%$
- E) Impossível responder

### Exercício 10: Comparação de População Rural

*(Com base na Tabela 2)*  
**Quantos milhões de pessoas viviam em zonas rurais na Ásia em 2020?**

- A) $2.145,2$ milhões
- B) $2.274,1$ milhões
- C) $2.366,9$ milhões
- D) $2.512,0$ milhões
- E) Impossível responder

### Exercício 11: Média de Superfície por País

*(Com base na Tabela 2)*  
**Qual continente tem a maior superfície média por país?**

- A) África
- B) Ásia
- C) América do Norte
- D) América do Sul
- E) Europa

### Exercício 12: Percentagem de Mudança na Matriz Energética

*(Com base na Tabela 3)*  
**Qual foi a variação percentual do consumo de energias renováveis na UE entre 2010 e 2020?**

- A) $+37,9\%$
- B) $+61,1\%$
- C) $+72,2\%$
- D) $+85,0\%$
- E) Impossível responder

### Exercício 13: Custo Total de Importações de Petróleo

*(Com base na Tabela 3)*  
**Em 2020, qual foi o custo total aproximado das importações de petróleo na UE?**

- A) $210,6$ mil milhões de EUR
- B) $222,3$ mil milhões de EUR
- C) $234,0$ mil milhões de EUR
- D) $246,8$ mil milhões de EUR
- E) Impossível responder

### Exercício 14: Dependência Externa de Gás vs Petróleo

*(Com base na Tabela 3)*  
**Em 2020, quantas vezes mais Mtoe de petróleo importou a UE em comparação com o gás natural importado?**

- A) $1,30$ vezes
- B) $1,51$ vezes
- C) $1,75$ vezes
- D) $2,10$ vezes
- E) Impossível responder

### Exercício 15: Custo Médio Ponderado da Energia Consumida

*(Com base na Tabela 3)*  
**Qual das seguintes fontes energéticas representou o maior gasto financeiro total na UE em 2020?**

- A) Petróleo
- B) Gás Natural
- C) Renováveis
- D) Nuclear
- E) Carvão

## 4. Resoluções Comentadas e Atalhos

### Resolução do Exercício 1

1. **Determinar o PIB de cada país em 2015:**
   - $\text{PIB} = \frac{\text{Despesas I\&D}}{\%\text{ I\&D do PIB}}$
   - Suécia: $\text{PIB}_{\text{SE}} = \frac{14.800}{0,0326} \approx 453.987 \text{ M€}$
   - Espanha: $\text{PIB}_{\text{ES}} = \frac{13.250}{0,0122} \approx 1.086.065 \text{ M€}$
2. **Calcular o rácio Suécia / Espanha:**
   - $\text{Rácio} = \frac{453.987}{1.086.065} \approx 0,418 \approx 0,42$
3. **Comparar com as opções:** $0,42$ aproxima-se mais de $1/2$ ($0,50$) do que de $1/3$ ($0,33$).

- **Resposta Correta:** **B) 1/2**

### Resolução do Exercício 2

1. **Fator Multiplicativo:**
   - $F_{\text{PIB}} = 1,08$
   - Variação $\%_{\text{I\&D}} = \frac{1,24}{1,22} \approx 1,0164$
   - Variação $\%_{\text{Público}} = \frac{39,8}{41,5} \approx 0,9590$
2. **Fator Total (**$F$**):**
   - $F = 1,08 \times 1,0164 \times 0,9590 \approx 1,0527$
3. **Variação percentual:** $(1,0527 - 1) \times 100\% = 5,27\% \approx 5,32\%$

- **Resposta Correta:** **B) 5,32%**

### Resolução do Exercício 3

1. $\text{PIB}_{\text{Polónia}} = \frac{4.750 \text{ M€}}{0,0100} = 475.000 \text{ M€}$
2. $\text{População} = \frac{475.000.000.000}{11.200} \approx 42,4 \text{ milhões}$

- **Resposta Correta:** **C) 42,4 milhões**

### Resolução do Exercício 4

- $30.065.000 + 10.180.000 = 40.245.000 \text{ km}^2$
- **Resposta Correta:** **A) 40 245 000**

### Resolução do Exercício 5

- População Urbana = $430,8 \times 0,83 = 357,564 \approx 357,6 \text{ milhões}$
- **Resposta Correta:** **B) 357,6 milhões**

### Resolução do Exercício 6

- Sem a taxa de variação do PIB de Itália entre 2015 e 2018, não é possível saber o valor das despesas em 2018.
- **Resposta Correta:** **E) Impossível responder**

### Resolução do Exercício 7

- Ásia: $\frac{4.641,0 \text{ M}}{44,579 \text{ M km}^2} \approx 104 \text{ hab/km}^2$ (o valor mais elevado de todos os continentes).
- **Resposta Correta:** **B) Ásia**

### Resolução do Exercício 8

1. $\text{PIB}_{\text{Alemanha}} = \frac{88.800}{0,0288} \approx 3.083.333 \text{ M€}$
2. $\text{PIB}_{\text{Itália}} = \frac{22.100}{0,0134} \approx 1.649.253 \text{ M€}$
3. $\text{Rácio} = \frac{3.083.333}{1.649.253} \approx 1,869 \approx \frac{15}{8} = 1,875$

- **Resposta Correta:** **C) 15/8**

### Resolução do Exercício 9

1. $F = F_{\text{PIB}} \times \left( \frac{\%_{\text{I\&D 2018}}}{\%_{\text{I\&D 2015}}} \right) = 1,06 \times \frac{3,13}{2,88} \approx 1,06 \times 1,0868 = 1,152$
2. $\text{Variação} = (1,152 - 1) \times 100\% = 15,2\%$

- **Resposta Correta:** **C) 15,2%**

### Resolução do Exercício 10

1. $\% \text{ População Rural} = 100\% - 51\% = 49\%$
2. $\text{População Rural} = 4.641,0 \times 0,49 = 2.274,09 \approx 2.274,1 \text{ milhões}$

- **Resposta Correta:** **B) 2.274,1 milhões**

### Resolução do Exercício 11

- América do Sul: $\frac{17.840.000}{12} \approx 1.486.666 \text{ km}^2/\text{país}$
- América do Norte: $\frac{24.709.000}{23} \approx 1.074.304 \text{ km}^2/\text{país}$
- Ásia: $\frac{44.579.000}{49} \approx 909.775 \text{ km}^2/\text{país}$
- **Resposta Correta:** **D) América do Sul**

### Resolução do Exercício 12

- $\text{Variação} = \frac{290 - 180}{180} = \frac{110}{180} \approx 61,11\%$
- **Resposta Correta:** **B) +61,1%**

### Resolução do Exercício 13

1. $\text{Petróleo Importado} = 520 \text{ Mtoe} \times 0,95 = 494 \text{ Mtoe}$
2. $\text{Custo Total} = 494 \times 450.000 €/\text{Mtoe} = 222.300.000.000 € = 222,3 \text{ mil milhões de EUR}$

- **Resposta Correta:** **B) 222,3 mil milhões de EUR**

### Resolução do Exercício 14

1. $\text{Petróleo Importado} = 520 \times 0,95 = 494 \text{ Mtoe}$
2. $\text{Gás Importado} = 390 \times 0,84 = 327,6 \text{ Mtoe}$
3. $\text{Rácio} = \frac{494}{327,6} \approx 1,507 \approx 1,51$

- **Resposta Correta:** **B) 1,51 vezes**

### Resolução do Exercício 15

- Petróleo: $520 \times 450.000 = 234.000 \text{ milhões}$
- Gás Natural: $390 \times 320.000 = 124.800 \text{ milhões}$
- Renováveis: $290 \times 180.000 = 52.200 \text{ milhões}$
- Nuclear: $180 \times 210.000 = 37.800 \text{ milhões}$
- **Resposta Correta:** **A) Petróleo**