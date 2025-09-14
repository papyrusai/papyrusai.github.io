## Plan de acción para filtraciones antiguas (no implementar aún)

1) Revocar y rotar credenciales comprometidas
- MongoDB Atlas: Rotar usuario/contraseña asociados al URI filtrado. Crear nuevo usuario con permisos mínimos y borrar el usuario expuesto. Actualizar `MONGODB_URI` en secretos de despliegue (GitHub Actions/Host) y en `.env.local`.
- Stripe: Rotar `sk_test_...` y revisar si hay `sk_live` asociados. Eliminar claves no usadas. Actualizar variables de entorno seguras.
- SSH privada en `node_modules/.../test/test_rsa_privkey.pem`: Confirmar que es un archivo de test de dependencia. Si hubiera alguna clave real, revocar en el proveedor y volver a crear par de claves. Auditar `known_hosts`/deploy keys.

2) Limpieza del historial de Git (BFG/`git filter-repo`)
- Usar `git filter-repo` para purgar los blobs con secretos históricos sin borrar archivos actuales:
  - Identificar rutas/commits con secretos expuestos (según alertas).
  - Reescribir el historial eliminando los contenidos sensibles (manteniendo los archivos con placeholders).
  - Forzar push (`--force-with-lease`) a ramas afectadas y pedir a colaboradores que re-clonen.

3) Endurecer configuración y flujos
- Mover todos los secretos a variables de entorno y gestores (GitHub Secrets, 1Password, Doppler, etc.).
- Añadir `.env*` a `.gitignore` (ya presente), revisar que no haya otros archivos sensibles sin ignorar.
- Añadir pre-commit `gitleaks`/`trufflehog` para bloquear secretos antes del commit.
- Configurar GitHub Advanced Security/Secret Scanning y alertas en PR.

4) Validaciones y monitorización
- Ejecutar un escaneo completo con `gitleaks` en el repo e historial tras la reescritura.
- Revisar logs de acceso en MongoDB/Stripe por actividad anómala desde la fecha de filtración.
- Establecer rotación periódica de credenciales y principio de mínimo privilegio.

5) Comunicación/coordinar
- Notificar al equipo de la rotación y del rebase forzado post `filter-repo`.
- Documentar variables requeridas (`MONGODB_URI`, `STRIPE_SECRET_KEY`, etc.) y cómo cargarlas en dev/prod.
