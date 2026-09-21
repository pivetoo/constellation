Set WshShell = CreateObject("WScript.Shell")

' 1. Encerra qualquer instancia anterior na porta 6012 para garantir que inicie sem conflitos
WshShell.Run "cmd /c for /f ""tokens=5"" %a in ('netstat -aon ^| findstr "":6012"" ^| findstr ""LISTENING""') do taskkill /F /PID %a >nul 2>&1", 0, True

' 2. Muda para o diretorio do Constellation
WshShell.CurrentDirectory = "C:\development\studies\constellation"

' 3. Executa o servidor 100% em background (janela invisivel 0)
WshShell.Run "cmd /c node bin\constellation.js serve > logs\server.log 2>&1", 0, False

' 4. Aguarda o servidor inicializar e abre o Dashboard no navegador padrao
WScript.Sleep 1500
WshShell.Run "http://localhost:6012"
