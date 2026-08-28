import { getLogger } from "@ssau-schedule/shared/logger"
import { env } from "./env"

const log = getLogger(env.LOG_LEVEL.toLowerCase())

export default log
