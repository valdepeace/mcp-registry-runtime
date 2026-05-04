# MCP Runtime PoC (Personal) - Roadmap + Tareas

## Contexto (repo actual)
Monorepo con:
- backend/: Express.js + TypeScript + SQLite (better-sqlite3)
- frontend/: SvelteKit + Tailwind
- Registry de MCP privados + sync con registry oficial
- API pública /v0.1/* y admin /admin/* ya implementadas

Objetivo:
Añadir una nueva funcionalidad "runtime" (uso personal, no exposición pública):
- Poder "instanciar" un MCP del catálogo y ejecutarlo localmente
- Arrancar/parar/reiniciar procesos MCP con PM2
- Tener visibilidad básica (estado, pid, uptime, restarts, logs tail)
- Usar ezpm2gui como dashboard web local para PM2

Principio clave:
Separar "catálogo" (qué MCP existen) de "runtime" (qué MCP están corriendo en esta máquina).
Crear un modelo nuevo runtime que referencie server_name + version del registry.

---

## Estado actual: ✅ COMPLETADO

### Fase 1 (MVP runtime sin UI) ✅
- [x] Tabla runtime_instances + migración automática
- [x] pm2.service.ts (start/stop/restart/describe/logsTail)
- [x] runtime.service.ts + rutas admin
- [x] test-mcp-server.mjs para pruebas
- [x] Documentación PM2 (ver abajo)

### Fase 2 (Observabilidad básica) ✅
- [x] Healthcheck polling con status `degraded`
- [x] endpoint_url/health_url autogenerado desde port
- [x] last_error con logs recientes cuando pm2 start falla

### Fase 3 (UI simple) ✅
- [x] Pantalla /admin/runtime con lista + acciones
- [x] Modal logs tail
- [x] Form create instance
- [x] RuntimeCard con status badges

### Fase 4 (Calidad de vida) ✅
- [x] Start/stop múltiple (bulk actions)
- [x] Importar receta desde catálogo (POST /admin/runtime/instances/from-catalog)
- [x] Documentación pm2-logrotate (ver abajo)

---

## API Endpoints implementados

### CRUD
```
GET    /admin/runtime/instances              # Listar (con sync PM2)
POST   /admin/runtime/instances              # Crear manual
POST   /admin/runtime/instances/from-catalog # Crear desde catálogo
GET    /admin/runtime/instances/:id          # Obtener
PUT    /admin/runtime/instances/:id          # Actualizar
DELETE /admin/runtime/instances/:id          # Eliminar
```

### Acciones
```
POST   /admin/runtime/instances/:id/start    # Arrancar
POST   /admin/runtime/instances/:id/stop     # Parar
POST   /admin/runtime/instances/:id/restart  # Reiniciar
GET    /admin/runtime/instances/:id/status   # Status fresco
GET    /admin/runtime/instances/:id/logs     # Tail logs
GET    /admin/runtime/instances/:id/health   # Check health
```

### Bulk
```
POST   /admin/runtime/bulk/start             # Start múltiple
POST   /admin/runtime/bulk/stop              # Stop múltiple
POST   /admin/runtime/bulk/restart           # Restart múltiple
POST   /admin/runtime/sync                   # Sync all desde PM2
POST   /admin/runtime/health                 # Check health all
```

---

## Comandos PM2 útiles

```bash
# Listar procesos
pm2 list
pm2 ls

# Ver logs
pm2 logs                    # Todos
pm2 logs mcp--org-name--1.0 # Específico

# Monitor en tiempo real
pm2 monit

# Info detallada
pm2 describe mcp--org-name--1.0

# Reiniciar todo
pm2 restart all

# Limpiar procesos eliminados
pm2 delete all

# Guardar estado (para restaurar después de reboot)
pm2 save
pm2 resurrect
```

---

## Configuración pm2-logrotate

PM2 por defecto no rota logs. Instalar el módulo:

```bash
# Instalar
pm2 install pm2-logrotate

# Configurar (valores recomendados)
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 7
pm2 set pm2-logrotate:compress true
pm2 set pm2-logrotate:dateFormat YYYY-MM-DD_HH-mm-ss
pm2 set pm2-logrotate:workerInterval 30
pm2 set pm2-logrotate:rotateInterval 0 0 * * *

# Verificar configuración
pm2 conf pm2-logrotate
```

### Opciones principales

| Opción | Default | Descripción |
|--------|---------|-------------|
| `max_size` | 10M | Tamaño máximo antes de rotar |
| `retain` | 30 | Número de archivos a mantener |
| `compress` | false | Comprimir logs rotados (.gz) |
| `dateFormat` | YYYY-MM-DD_HH-mm-ss | Formato fecha en nombre |
| `rotateInterval` | 0 0 * * * | Cron para rotación (diario) |
| `workerInterval` | 30 | Segundos entre checks |

---

## Integración ezpm2gui

Dashboard web local para visualizar procesos PM2.

### Instalación
```bash
npm install -g ezpm2gui
```

### Ejecución
```bash
# En puerto por defecto (9615)
ezpm2gui

# Puerto custom
ezpm2gui --port 9620

# Solo localhost (recomendado)
ezpm2gui --host 127.0.0.1 --port 9620
```

### Acceso
Abrir en navegador: http://127.0.0.1:9620

### Seguridad
- **NUNCA** exponer ezpm2gui fuera de localhost
- Si necesitas acceso remoto, usa SSH tunnel:
  ```bash
  ssh -L 9620:127.0.0.1:9620 user@server
  ```

---

## Ejemplo: Crear instancia desde catálogo

```bash
# 1. Login
TOKEN=$(curl -s -X POST http://localhost:3000/admin/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin"}' | jq -r .token)

# 2. Crear desde catálogo (auto-detecta cmd/args)
curl -X POST http://localhost:3000/admin/runtime/instances/from-catalog \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"server_name": "anthropics/mcp-server-fetch"}'

# 3. Arrancar
curl -X POST http://localhost:3000/admin/runtime/instances/{id}/start \
  -H "Authorization: Bearer $TOKEN"
```

---

## Notas de seguridad (uso personal)
- No exponer ezpm2gui fuera de localhost
- env_json puede incluir secretos; no commitear datos sensibles
- Preferir variables de entorno del sistema sobre hardcoded secrets
- El backend debe correr con el mismo usuario que PM2

---

## Definition of Done ✅
- [x] Crear runtime_instance apuntando a server/version del catálogo
- [x] Start/stop/restart desde endpoints admin y UI
- [x] Ver procesos en PM2 (pm2 list, pm2 monit)
- [x] Consultar status y logs tail desde API y UI
- [x] Bulk actions para múltiples instancias
- [x] Crear instancia auto-detectando config desde catálogo
