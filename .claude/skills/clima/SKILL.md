---
name: clima
description: Obtiene temperatura y estado del clima actual de una ciudad (por defecto La Paz, Bolivia) con la API gratuita Open-Meteo vía curl. Úsala cuando pidan el clima, la temperatura o el tiempo actual.
---

# Clima local

Lee el clima actual con `curl` (sin API key, sin WebSearch). Datos de observación en tiempo real, no pronóstico.

## Uso

`/clima [ciudad]` — sin argumento usa La Paz, Bolivia.

## Pasos

1. Coordenadas:
   - Por defecto La Paz: `latitude=-16.5`, `longitude=-68.15`, `timezone=America/La_Paz`.
   - Otra ciudad: geocodificar con
     `curl -s "https://geocoding-api.open-meteo.com/v1/search?name=<ciudad>&count=1&language=es"`
     y tomar `results[0].latitude`, `longitude`, `timezone`.
2. Clima actual:
   ```bash
   curl -s "https://api.open-meteo.com/v1/forecast?latitude=-16.5&longitude=-68.15&timezone=America/La_Paz&current=temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,weather_code,wind_speed_10m"
   ```
3. Interpretar `current.weather_code` (WMO):
   - 0 despejado · 1-3 parcialmente nublado/nublado · 45,48 niebla
   - 51-57 llovizna · 61-67 lluvia · 71-77 nieve · 80-82 chubascos
   - 85-86 chubascos de nieve · 95-99 tormenta
4. Responder muy conciso, en español, formato:
   `<Ciudad>: <T> °C (sensación <S> °C), <estado>, humedad <H>%, viento <V> km/h. Hora: <current.time>`

## Notas

- Si `curl` falla o devuelve error, decirlo; no inventar datos.
- Enviar solo el nombre de la ciudad o coordenadas; nada más del usuario.
