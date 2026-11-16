/** Returns a function that removes the listeners again (for long-lived processes like `codify prompt`) */
export function registerKillListeners(kill: (code: number | string) => void): () => void {
  const killHandler = (code: number | string) => {
    kill(code);

    let exitCode = 0;
    switch (code) {
      case 'SIGTERM': {
        exitCode = 143;
        break;
      }

      case 'SIGHUP': {
        exitCode = 129;
        break;
      }

      case 'SIGINT': {
        exitCode = 130;
        break;
      }
    }

    const parsedCode = typeof code === 'string' ? Number.parseInt(code, 10) : code;
    if (Number.isInteger(parsedCode)) {
      exitCode = parsedCode;
    }

    process.exit(exitCode);
  }

  process.on('exit', killHandler)
  process.on('SIGINT', killHandler)
  process.on('SIGTERM', killHandler)
  process.on('SIGHUP', killHandler)

  return () => {
    process.off('exit', killHandler)
    process.off('SIGINT', killHandler)
    process.off('SIGTERM', killHandler)
    process.off('SIGHUP', killHandler)
  }
}
