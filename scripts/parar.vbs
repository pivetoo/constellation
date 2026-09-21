Set WshShell = CreateObject("WScript.Shell")

' Encerra o processo ouvindo na porta 6012
WshShell.Run "cmd /c for /f ""tokens=5"" %a in ('netstat -aon ^| findstr "":6012"" ^| findstr ""LISTENING""') do taskkill /F /PID %a >nul 2>&1", 0, True

MsgBox "Servidor Constellation encerrado com sucesso.", 64, "Constellation"
