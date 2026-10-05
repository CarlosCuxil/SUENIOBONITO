# Sueño — app nativa para Android

Monitor de sueño personal estilo Sleep Cycle: graba con la pantalla apagada,
detecta ronquidos, habla y tos, estima fases de sueño, despertador inteligente,
sonidos para dormir, respiración guiada, recordatorio para acostarte, diario,
estadísticas, reporte semanal y widget.

## Cómo se compila
Cada vez que subes cambios a la rama main, GitHub Actions compila el APK solo
(pestaña Actions) y lo publica en Releases como Sueno.apk.

## Estructura
- app/src/main/java/gt/calin/sueno/ : parte nativa (grabación, alarma, sonidos, widget)
- app/src/main/assets/www/ : interfaz (pantallas, gráficas, animaciones)
- .github/workflows/build.yml : compilación automática
