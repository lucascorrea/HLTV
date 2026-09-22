import { HLTVConfig } from '../config'
import { FullPlayer, getPlayer } from './getPlayer'
import { fetchHltvSearch } from './fetchHltvSearch'

export const getPlayerByName =
  (config: HLTVConfig) =>
  async ({ name }: { name: string }): Promise<FullPlayer> => {
    const pageContent = await fetchHltvSearch(config, name)
    const firstResult = pageContent[0].players[0]

    if (!firstResult) {
      throw new Error(`Player ${name} not found`)
    }

    return getPlayer(config)({ id: firstResult.id })
  }
