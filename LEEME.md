# Sueño — app para Android

Monitor de sueño estilo Sleep Cycle: graba con la pantalla apagada, detecta ronquidos,
habla, tos y posibles pausas al respirar, estima fases, despertador inteligente con
amanecer y misión, modo colchón, anti-ronquido, siesta, sonidos para dormir,
respiración guiada, cafeína, clima, plan de horario, cronotipo, logros, diario,
estadísticas, reporte semanal, PDF para el médico y widget.

## Compilación
Cada cambio en la rama main compila solo (pestaña Actions) y publica en Releases:
- Sueno.apk: para instalar directo en el celular.
- Sueno-PlayStore.aab: para Google Play (requiere los secrets de la llave privada).

## Estructura
- app/src/main/java/gt/calin/sueno/ : parte nativa (grabación, alarma, sonidos, sensores, widget)
- app/src/main/assets/www/ : interfaz (pantallas, gráficas, animaciones)
- privacidad.html : política de privacidad (GitHub Pages)
- .github/workflows/build.yml : compilación automática
