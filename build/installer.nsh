!include "LogicLib.nsh"

!ifndef BUILD_UNINSTALLER
Function SetPreferredInstallDir
  Push $0
  Push $1
  Push $2

  StrCpy $0 ""
  StrCpy $1 "$WINDIR" 2
  StrCpy $2 "$EXEDIR" 2

  ${If} $2 != ""
  ${AndIf} $2 != $1
    StrCpy $0 "$2\\Apps\\${APP_FILENAME}"
  ${EndIf}

  ${If} $0 == ""
    IfFileExists "D:\\" 0 +2
      StrCpy $0 "D:\\Apps\\${APP_FILENAME}"
  ${EndIf}
  ${If} $0 == ""
    IfFileExists "E:\\" 0 +2
      StrCpy $0 "E:\\Apps\\${APP_FILENAME}"
  ${EndIf}
  ${If} $0 == ""
    IfFileExists "F:\\" 0 +2
      StrCpy $0 "F:\\Apps\\${APP_FILENAME}"
  ${EndIf}
  ${If} $0 == ""
    IfFileExists "G:\\" 0 +2
      StrCpy $0 "G:\\Apps\\${APP_FILENAME}"
  ${EndIf}
  ${If} $0 == ""
    IfFileExists "H:\\" 0 +2
      StrCpy $0 "H:\\Apps\\${APP_FILENAME}"
  ${EndIf}

  ${If} $0 != ""
    StrCpy $INSTDIR $0
  ${EndIf}

  Pop $2
  Pop $1
  Pop $0
FunctionEnd

!macro customInit
  ; 升级/重装时，electron-builder 的 assisted installer 会优先从注册表里的 InstallLocation 恢复旧目录。
  ; 这里仅在“确实没有既有安装记录”且用户也没有显式传入 /D 时，为首次安装挑一个更稳妥的非系统盘默认目录。
  ${ifNot} ${isUpdated}
    ${GetParameters} $R0
    ${GetOptions} $R0 "/D=" $R1
    ${If} ${Errors}
    ${AndIf} $hasPerUserInstallation == "0"
    ${AndIf} $hasPerMachineInstallation == "0"
      Call SetPreferredInstallDir
    ${EndIf}
  ${endif}
!macroend
!endif
