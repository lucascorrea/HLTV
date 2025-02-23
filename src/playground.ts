import { HLTV } from './index'

const log = (promise: Promise<any>) =>
  promise
    .then((res) => console.dir(res, { depth: null }))
    .catch((err) => console.log(err))

log(HLTV.getMatch({ id: 2378917 }))
// log(HLTV.getMatches( { teamIds: [11571] }))
// log(HLTV.getMatches())
// log(HLTV.getEvent({ id: 8171 }))
// log(HLTV.getEvents())
// log(HLTV.getMatchMapStats({ id: 116437 }))
// log(HLTV.getMatchStats({ id: 79924 }))
// log(HLTV.getMatchesStats( { startDate: '2024-11-14', endDate: '2024-11-14' }))
// log(HLTV.getPlayer({ id: 11893 }))
// log(HLTV.getPlayerRanking())
// log(HLTV.getPlayerStats({ id: 11893 }))
// log(HLTV.getRecentThreads())
// log(HLTV.getStreams())
// log(HLTV.getTeam({ id: 9565 }))
// log(HLTV.getTeamByName({ name: "JiJieHao" }))
// log(HLTV.getTeamStats({ id: 13025 }))
// log(HLTV.getPastEvents({ startDate: '2019-3-1', endDate: '2019-3-29' }))
// log(HLTV.getTeamRanking())
// log(HLTV.getResults({ eventIds: [1617] }))
// log(HLTV.getResults( { startDate: '2024-11-16', endDate: '2024-11-17' }))
// log(HLTV.getNews())
