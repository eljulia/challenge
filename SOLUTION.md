# SOLUTION.md — Reto tecnico KOL (Castleberry Media)

---

## Que identifique

Recorri el flujo completo de la aplicacion con los tres usuarios de prueba y detecte 6 bugs distribuidos en 5 archivos. A continuacion describo cada uno con su causa raiz y el comportamiento observado antes del fix.

### Bug 1 — Titulos de articulos incorrectos (Alta severidad)

**Archivo:** `src/pages/TopicSelection.tsx` lineas 25-27 y 136

La funcion `brokenExtractTitle(_article, index)` ignoraba el parametro `_article` y retornaba la cadena `"Article " + (index + 1)`. Cada tarjeta mostraba un titulo generico como "Article 1", "Article 2", sin importar el contenido real del articulo en la base de datos. Esto hace imposible distinguir los articulos entre si.

### Bug 2 — Redencion de puntos afecta al usuario equivocado (Alta severidad)

**Archivo:** `src/pages/Dashboard.tsx` linea 52

`redeemPoints()` usaba `leaderboard[0].id` como objetivo del `UPDATE` en Supabase. Esto descontaba puntos del usuario que estaba primero en el leaderboard, no del usuario autenticado. Si el usuario actual no era el lider, su balance no cambiaba nunca y se corrompia el puntaje de otra persona.

### Bug 3 — Las ediciones de posts no se guardan (Severidad media)

**Archivo:** `src/pages/GeneratedPosts.tsx` lineas 107-114

`saveEdit()` mostraba un toast de exito pero no llamaba a ningun metodo de escritura en Supabase. El texto editado existia solo en el estado local de React. Al recargar la pagina, el post revertia al contenido original generado por la Edge Function.

### Bug 4 — Imagen del post programado siempre en blanco (Severidad media)

**Archivo:** `src/pages/GeneratedPosts.tsx` linea 213

El preview del post programado leia `post.articles?.image_url` (con guion bajo). El nombre real de la columna en la base de datos es `imageurl` (sin guion bajo), segun el esquema de Supabase. La propiedad siempre era `undefined` y el espacio de imagen renderizaba un placeholder gris.

### Bug 5 — display_name sobreescrito en cada guardado de preferencias (Severidad media)

**Archivo:** `src/pages/Onboarding.tsx` linea 91

El `upsert` en `savePreferences()` siempre calculaba `display_name` como `user.email.split("@")[0]`. Si el usuario ya tenia un nombre guardado en la base de datos, cada vez que guardaba sus preferencias ese nombre era reemplazado por el prefijo del email (por ejemplo, `"demoa"`).

### Bug 6 — Leaderboard solo muestra al usuario actual (RLS Supabase)

**Archivo:** `supabase/migrations/20260521000000_fix_profiles_rls_select.sql`

La politica RLS de SELECT en la tabla `profiles` tenia la condicion `USING (auth.uid() = id)`. Postgres filtra silenciosamente las filas que no cumplen la politica, por lo que la consulta del leaderboard en `Dashboard.tsx` (que pide los top 5 perfiles ordenados por puntos) solo retornaba la fila del usuario autenticado. Los otros 4 lugares del leaderboard quedaban vacios.

---

## Que cambios realize

Cada bug se corrigio en una rama separada con su propio issue y PR en GitHub.

### Bug 1 — `src/pages/TopicSelection.tsx`

- Elimine la funcion `brokenExtractTitle` y su tipo parcial.
- Defini un tipo explicito `ArticleRow` con las columnas reales de la tabla `articles`.
- En la linea 140 reemplace la llamada a la funcion por `article.title` directamente.

### Bug 2 — `src/pages/Dashboard.tsx`

- En `redeemPoints()`, cambie `leaderboard[0].id` por `profile.id`.
- `profile` se carga al montar el componente con `SELECT ... WHERE id = user.id`, por lo que siempre contiene el perfil del usuario autenticado.

### Bug 3 — `src/pages/GeneratedPosts.tsx`

- Agregue `await supabase.from("posts").update({ content: draft }).eq("id", editingPost.id)` antes de cerrar el dialog.
- Despues del `update`, recargo los posts desde Supabase para que el estado local refleje lo que realmente quedo guardado en la base de datos.

### Bug 4 — `src/pages/GeneratedPosts.tsx`

- Cambie `post.articles?.image_url` por `post.articles?.imageurl` para que coincida con el nombre real de la columna.

### Bug 5 — `src/pages/Onboarding.tsx`

- Agregue el estado `existingDisplayName` que carga el `display_name` actual desde la base de datos al montar el componente.
- En el `upsert`, use `existingDisplayName || user.email.split("@")[0] || "Demo User"`. El prefijo del email solo se usa como fallback cuando no existe ningun nombre previo.

### Bug 6 — Nueva migracion SQL

- Cree `supabase/migrations/20260521000000_fix_profiles_rls_select.sql`.
- La migracion elimina la politica restrictiva y crea `"Authenticated users can read all profiles"` con `USING (true)` limitada al rol `authenticated`.
- Las politicas de escritura (`INSERT`, `UPDATE`, `DELETE`) permanecen con `auth.uid() = id` para proteger los datos de cada usuario.

### Mejora de calidad adicional

- En `GeneratedPosts.tsx`, normalice el error de `supabase.functions.invoke`: `FunctionsHttpError` no extiende `Error`, por lo que agrege `throw new Error(error.message ?? String(error))` inmediatamente despues de detectar el error. Esto garantiza que el mensaje del servidor llega al toast en lugar de perderse.

---

## Por que tome esas decisiones

**Minima superficie de cambio.** Cada fix toca exactamente las lineas responsables del bug sin refactorizar codigo adyacente. Esto reduce el riesgo de introducir regresiones y hace que cada PR sea facil de revisar.

**RLS con migracion SQL en lugar de RPC.** Pude haber creado una funcion `get_leaderboard()` con `SECURITY DEFINER` para saltear RLS, pero eso habria ocultado el problema en lugar de resolverlo. La migracion es la solucion correcta: ajusta la politica al comportamiento que el producto realmente necesita (leer perfiles ajenos para el ranking) mientras mantiene las escrituras protegidas.

**Estado derivado de la base de datos para `display_name`.** En lugar de agregar un campo de formulario para que el usuario escriba su nombre, preservo el nombre que ya esta en la base de datos. Esto no rompe el flujo existente ni agrega complejidad al formulario de onboarding.

**Recarga post-guardado en `saveEdit`.** Despues de actualizar el post, recargo los datos desde Supabase en lugar de actualizar el estado local manualmente. Esto garantiza coherencia entre lo que el usuario ve y lo que hay en la base de datos, y cubre casos borde como errores parciales de escritura.

**Normalizacion de `FunctionsHttpError`.** El SDK de Supabase lanza un tipo de error propio que no hereda de `Error`. Normalizar al `catch` hace que el manejo de errores sea predecible para cualquier desarrollador que trabaje en este codigo en el futuro.

---

## Que mejoraria si tuviera mas tiempo

### 1. Manejo de errores mas granular en todas las paginas

Actualmente la mayoria de los errores se capturan con un `catch (err: unknown)` generico y se muestran en un toast. Implementaria codigos de error diferenciados: errores de red vs. errores de validacion vs. errores de permisos, con mensajes especificos para cada caso y, donde tenga sentido, un boton de reintento.

### 2. Estados de carga por accion, no por pagina

El loading state actual bloquea toda la pantalla mientras se cargan los datos iniciales. Usaria skeleton loaders por tarjeta o por seccion para que el usuario vea la estructura de la UI mientras los datos llegan. Esto mejora la percepcion de velocidad sin cambiar el tiempo real de carga.

### 3. Validacion de formularios con `react-hook-form` y `zod`

El formulario de Onboarding no tiene validacion del lado del cliente mas alla de los atributos HTML nativos. Agregaria esquemas de validacion con `zod` y manejos de error por campo para dar feedback inmediato antes de llamar a Supabase.

### 4. Optimistic updates en la redencion de puntos y en la edicion de posts

Actualmente el usuario tiene que esperar la respuesta de Supabase para ver el cambio reflejado. Implementaria optimistic updates: actualizar el estado local inmediatamente y revertir si la operacion falla. Esto hace que la UI se sienta instantanea.

### 5. Tests de integracion con Playwright

El flujo de 12 pasos se verifico manualmente con Playwright MCP durante el desarrollo. Lo formalizaria como una suite de tests automatizados que corra en CI para prevenir regresiones en cada PR.

### 6. Politica RLS mas granular para el leaderboard

La politica actual de `profiles` con `USING (true)` expone todas las columnas del perfil a cualquier usuario autenticado. Con mas tiempo crearia una vista materializada `leaderboard_view` que exponga solo `display_name` y `current_month_points`, y restringiria el SELECT directo a `profiles` para que cada usuario solo vea su propia fila completa.

---

## Verificacion

Verifique el flujo completo de forma manual en el navegador contra `http://localhost:8080`, recorriendo los 12 pasos con los tres usuarios de prueba. Resultado: **12/12 PASS**.

| Paso | Descripcion | Resultado |
|---|---|---|
| 1 | Login como demo.a | PASS |
| 2 | Dashboard carga con puntos y leaderboard | PASS |
| 3 | Redencion descuenta del usuario actual | PASS |
| 4 | Leaderboard muestra 3 usuarios distintos | PASS |
| 5 | Tarjetas de articulos muestran titulos reales | PASS |
| 6 | Seleccion de articulos persiste al recargar | PASS |
| 7 | Generacion de post via Edge Function crea un draft | PASS |
| 8 | Texto editado persiste despues de recargar | PASS |
| 9 | Preview programado muestra imagen del articulo | PASS |
| 10 | display_name se preserva despues de guardar preferencias | PASS |
| 11 | Pagina de perfil muestra email, preferencias y puntos | PASS |
| 12 | Logout borra la sesion y redirige a /login | PASS |

Ademas: `npm run lint` y `npm run build` sin errores ni advertencias.
