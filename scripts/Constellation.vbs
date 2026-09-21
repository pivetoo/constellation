Set WshShell = CreateObject("WScript.Shell")

Function IsServerRunning()
  On Error Resume Next
  Dim http
  Set http = CreateObject("MSXML2.ServerXMLHTTP.6.0")
  http.setTimeouts 500, 500, 500, 500
  http.open "GET", "http://localhost:6012/api/config", False
  http.send
  
  If Err.Number <> 0 Then
    IsServerRunning = False
    Err.Clear
  Else
    If http.Status = 200 Then
      IsServerRunning = True
    Else
      IsServerRunning = False
    End If
  End If
  On Error GoTo 0
End Function

If IsServerRunning() Then
  ans = MsgBox("Constellation ja esta rodando em segundo plano (porta 6012)." & vbCrLf & vbCrLf & _
               "- Clique em [ SIM ] para PARAR o servidor." & vbCrLf & _
               "- Clique em [ NAO ] para ABRIR o Dashboard no navegador." & vbCrLf & _
               "- Clique em [ CANCELAR ] para manter rodando.", _
               vbYesNoCancel + vbQuestion + vbDefaultButton2, "Constellation Pool")
  
  If ans = vbYes Then
    WshShell.CurrentDirectory = "C:\development\studies\constellation"
    WshShell.Run "cmd /c node bin\constellation.js stop", 0, True
    MsgBox "Servidor Constellation encerrado com sucesso.", vbInformation, "Constellation Pool"
  ElseIf ans = vbNo Then
    WshShell.Run "http://localhost:6012"
  End If
Else
  ' Muda para o diretorio do Constellation e inicia em background (janela 0 = invisivel)
  WshShell.CurrentDirectory = "C:\development\studies\constellation"
  WshShell.Run "cmd /c node bin\constellation.js serve > logs\server.log 2>&1", 0, False
  WScript.Sleep 1500
  WshShell.Run "http://localhost:6012"
End If
