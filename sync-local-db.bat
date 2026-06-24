@echo off
echo Syncing remote Cloudflare D1 to local dev database...
echo.

echo [1/2] Exporting remote database...
call npx wrangler d1 export foreveryoung-db --remote --output ./local-db-export.sql
if %errorlevel% neq 0 (
    echo ERROR: Export failed. Make sure you are logged in with: npx wrangler login
    pause
    exit /b 1
)

echo.
echo [1.5/2] Ensuring core tables exist...
call npx wrangler d1 execute foreveryoung-db --local --command "CREATE TABLE IF NOT EXISTS users (phone TEXT PRIMARY KEY, name TEXT, punches_cd INTEGER DEFAULT 0, punches_vinyl INTEGER DEFAULT 0, punches_cassette INTEGER DEFAULT 0, punches_45 INTEGER DEFAULT 0, last_checkin DATETIME);"
if %errorlevel% neq 0 (
    echo ERROR: Failed to create 'users' table.
    pause
    exit /b 1
)


echo.
echo [2/2] Seeding local database...
echo Clearing old local database state...
if exist ".wrangler\state\v3\d1\miniflare-D1DatabaseObject" (
    rmdir /s /q ".wrangler\state\v3\d1\miniflare-D1DatabaseObject"
)
call npx wrangler d1 execute foreveryoung-db --local --file ./local-db-export.sql
if %errorlevel% neq 0 (
    echo ERROR: Local seed failed.
    pause
    exit /b 1
)

echo.
echo Done! Local dev DB is now in sync with Cloudflare.
echo You can now run the dev server with: npx wrangler pages dev . --port=8789
pause
