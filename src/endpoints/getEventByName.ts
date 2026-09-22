import { HLTVConfig } from '../config'
import { FullEvent, getEvent } from './getEvent'
import { fetchHltvSearch } from './fetchHltvSearch'

export const getEventByName =
  (config: HLTVConfig) =>
  async ({ name }: { name: string }): Promise<FullEvent> => {
    try {
      const pageContent = await fetchHltvSearch(config, name)
      const firstResult = pageContent[0].events[0]

      if (!firstResult) {
        throw new Error(`Event ${name} not found`)
      }

      return getEvent(config)({ id: firstResult.id })
    } catch {
      throw new Error(`Event ${name} not found`)
    }
  }
