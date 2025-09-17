## Guía de migración a cuenta enterprise (estructura_empresa)

### Objetivo
Migrar un conjunto de usuarios (por dominio o lista de emails) a una estructura empresarial compartida en MongoDB utilizando el script `scripts/migrate_to_enterprise.js`. El proceso:
- Crea o reutiliza un documento `estructura_empresa` por dominio.
- Migra usuarios al contexto enterprise con permisos y plan adecuados.
- Realiza copias de seguridad de campos antes de moverlos/eliminarlos, guardando `*_old` para rollback.

### Requisitos previos
- Definir `DB_URI` en `.env` apuntando a la base de datos correcta.
- Verificar conectividad a MongoDB.
- Recomendado: ejecutar primero en entorno de staging y/o realizar backup de la colección `users`.

### Entradas (variables de entorno)
- `MIGRATE_USER_EMAILS`: lista separada por comas de emails a migrar. Si se define, tiene prioridad sobre `MIGRATE_DOMAIN`.
- `MIGRATE_DOMAIN`: dominio (p.ej., `empresa.com`) usado si no se especifica `MIGRATE_USER_EMAILS`. Puede deducirse del admin si falta.
- `MIGRATE_ADMIN_EMAIL`: email del admin (debe existir).
- `MIGRATE_DEFAULT_PERMISO`: `lectura` | `edicion` (aplicado al resto de usuarios; el admin será `admin`).
- `MIGRATE_DRY_RUN`: `true` | `false` (por defecto `true`). Si es `true`, solo imprime los cambios.
- `MIGRATE_USE_ADMIN_AS_EMPRESA_ID`: `true` | `false` (por defecto `true`). Si no existe `estructura_empresa`, crea una usando el antiguo `_id` del admin como `_id` de empresa para preservar matches históricos.
- `MIGRATE_LEGACY_USER_EMAILS`: lista separada por comas de emails cuyos `ObjectId` deben preservarse en `legacy_user_ids` de la empresa.

### Comportamiento del script (resumen)
1. Index de seguridad: crea índice parcial único para `estructura_empresa`.
2. Selección de usuarios: por lista explícita o por dominio.
3. Creación/selección de `estructura_empresa`:
   - Si no existe y `MIGRATE_USE_ADMIN_AS_EMPRESA_ID=true` y no es dry-run, realiza transacción para:
     - Copiar admin con nuevo `_id` y guardar `user_id_old`.
     - Crear `estructura_empresa` con `_id = admin_old_id`.
   - Si ya existe o `MIGRATE_USE_ADMIN_AS_EMPRESA_ID=false`, crea estándar.
4. Seed de datos de empresa desde usuarios (prioriza admin):
   - Listas: une de forma única.
   - Objetos: merge superficial.
   - `cobertura_legal`: normaliza y une.
   - Setea `subscription_plan=plan4`, `profile_type=empresa` y metadatos.
5. Actualización por usuario:
   - `tipo_cuenta=empresa`, `empresa={dominio}`, `estructura_empresa_id`, `admin_empresa_id`, `permiso` (`admin` para admin; `MIGRATE_DEFAULT_PERMISO` para el resto), `subscription_plan=plan4`.
   - Copias de seguridad: crea `*_old` para todos los campos movidos antes de `unset`.
   - Admin: si hubo swap de `_id`, guarda `user_id_old`.
6. Legacy ids: añade `legacy_user_ids` con ids de `MIGRATE_LEGACY_USER_EMAILS`.

### Ejecución (PowerShell)
Recomendación: no encadenar con `| cat` en PowerShell.

#### 1) Dry run (previo a aplicar)
```powershell
$env:MIGRATE_USER_EMAILS='user1@empresa.com,user2@empresa.com'
$env:MIGRATE_ADMIN_EMAIL='user1@empresa.com'
$env:MIGRATE_LEGACY_USER_EMAILS='user2@empresa.com'
$env:MIGRATE_DOMAIN='empresa.com'
$env:MIGRATE_DEFAULT_PERMISO='lectura'
$env:MIGRATE_USE_ADMIN_AS_EMPRESA_ID='true'
$env:MIGRATE_DRY_RUN='true'
node scripts/migrate_to_enterprise.js
```

Validar la salida: ver `$set`/`$unset` para `estructura_empresa` y cada usuario, y presencia de `*_old`.

#### 2) Aplicar migración
```powershell
$env:MIGRATE_DRY_RUN='false'
node scripts/migrate_to_enterprise.js
```

### Verificación posterior
Se incluye `scripts/verify_ws_enterprise.js` para revisar empresa/usuarios.

```powershell
node scripts/verify_ws_enterprise.js
```

El JSON devuelto debe mostrar, como mínimo:
- `estructura`: `profile_type=empresa`, `subscription_plan=plan4`, dominio correcto, `_id` de empresa igual a `user_id_old` del admin (cuando se usa swap), `legacy_user_ids` contiene el id de cada email en `MIGRATE_LEGACY_USER_EMAILS`.
- `users[]`: cada usuario con `tipo_cuenta=empresa`, `empresa={dominio}`, `estructura_empresa_id={_id empresa}`, `subscription_plan=plan4`, `permiso=admin|lectura|edicion` según corresponda, y `backup_keys` con `*_old`.

### Rollback (guía)
Gracias a las copias de seguridad `*_old`, se puede revertir manualmente:
1. Por usuario: restaurar campos desde `*_old` y volver a `tipo_cuenta` original si aplica. Ej.: `etiquetas_personalizadas <- etiquetas_personalizadas_old`, etc.; eliminar `empresa`, `estructura_empresa_id`, `admin_empresa_id`, `permiso` si procede.
2. En la empresa: si se sobrescribió algún campo, usar `<campo>_old` para revertir. Si se creó la `estructura_empresa` solo para esta migración y hay que eliminarla, evaluar dependencias antes.
3. Admin con swap de `_id`: si se hizo swap, el admin tiene `user_id_old` (el antiguo id). Cualquier reversión que implique ids debe planificarse con cuidado para no romper referencias.

Sugerencia: realizar rollback con scripts controlados (Node/Mongo) para asegurar consistencia; probar primero en staging.

### Pitfalls conocidos
- PowerShell puede interpretar caracteres del comando inline: evita piping (`| cat`) y preferir `;` para separar comandos.
- Si no se define `MIGRATE_DOMAIN`, se deduce del email del admin o de la primera cuenta en `MIGRATE_USER_EMAILS`.
- Re-ejecutar con los mismos parámetros es esencialmente idempotente en la mayoría de campos, pero evita alternar `MIGRATE_USE_ADMIN_AS_EMPRESA_ID` una vez creada la empresa.

### Ejemplo real (Weber Shandwick, completado)
- Emails: `BGonzalez@webershandwick.com`, `BHernandez@webershandwick.com`, `AFernandez-Huidobro@webershandwick.com`, `IBlanco@webershandwick.com`, `egarciaramon@webershandwick.com`
- Admin: `BGonzalez@webershandwick.com`
- Legacy: `BHernandez@webershandwick.com`
- Dominio: `webershandwick.com`
- Resultado verificado:
  - `estructura._id = admin.user_id_old`
  - `subscription_plan=plan4`, `profile_type=empresa`
  - `legacy_user_ids` contiene el id de `BHernandez@webershandwick.com`
  - Usuarios con `tipo_cuenta=empresa`, `estructura_empresa_id` correcto y backups `*_old` creados.

### Buenas prácticas clave
- Ejecutar siempre un dry run antes de aplicar.
- Mantener `MIGRATE_USE_ADMIN_AS_EMPRESA_ID=true` cuando se requiere preservar matches históricos por `_id`.
- Verificar con el script de comprobación y guardar un snapshot de los resultados.
- Evitar cambios manuales sin respaldos; el sistema ya genera `*_old` para facilitar rollback.










