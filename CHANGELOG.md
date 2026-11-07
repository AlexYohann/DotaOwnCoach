# Changelog

Versões seguem [SemVer](https://semver.org/lang/pt-BR/): MAJOR.MINOR.PATCH.
Cada versão tem uma tag git `vX.Y.Z`.

## [1.1.0] — 2026-11-06

### Adicionado
- Histórico mostra imagem e nome do herói (antes só `hero_id`), via `/constants/heroes` da OpenDota com cache de 1 dia.
- Coluna com data e hora da partida (horário de Brasília).
- Botão na home que abre a página de conta da Steam, onde aparece o Steam ID.

## [1.0.0] — 2026-11-06

### Adicionado
- Home com campo de Steam ID (Friend ID ou SteamID64).
- `/player/[id]`: perfil e últimas 20 partidas da OpenDota (resultado, K/D/A, duração, GPM/XPM, last hits).
- Mensagens para ID inválido, jogador inexistente, sem partidas/perfil privado, limite de requisições e OpenDota fora do ar.
