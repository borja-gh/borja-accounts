# Backlog

Prioridades coordinadas con el roadmap externo del proyecto. Este archivo conserva el detalle técnico y las ideas que no tienen prioridad en el roadmap.

## Prioridad actual

- [ ] Solicitar a GitHub Support la purga de referencias históricas de pull requests y cachés que conservan objetos privados. La reescritura de ramas y tags no elimina esas copias internas de GitHub.
- [ ] Definir el nombre y el logotipo del producto y aplicar el branding a la interfaz y a la distribución.

## A futuro

- [ ] Evaluar LangGraph para memoria y reanudación del asistente. Incorporarlo si esas necesidades justifican sustituir o ampliar el bucle iterativo actual.
- [ ] Permitir configurar proveedor y modelo del asistente, con adaptadores para los proveedores elegidos. Mantener la validación SQL, el scope y la confirmación de escrituras en la aplicación, independientes del proveedor.
- [ ] Preparar una aplicación descargable para macOS que incluya el runtime de Python y el frontend compilado, con instalación, arranque y actualización sin herramientas de desarrollo. Conservar los datos al actualizar y mantener la escucha en loopback.

## Ideas sin prioridad en el roadmap

Estas ideas requieren una decisión de alcance antes de incorporarse al trabajo de la beta local.

- [ ] Evaluar previsiones financieras con modelos de lenguaje y su integración en el asistente.
- [ ] Integrar un broker mediante `BrokerGateway`, adaptadores manual/Client Portal Gateway, sincronización de posiciones y estados de cotización (`LIVE`, `STALE`, `MANUAL`).
- [ ] Evaluar operativa de trading manual con confirmación y trading algorítmico.
- [ ] Evaluar multiusuario y autenticación.
- [ ] Evaluar Postgres, colas y cache si aparecen necesidades operativas que los justifiquen.
- [ ] Ampliar las divisas soportadas más allá de EUR/USD.
