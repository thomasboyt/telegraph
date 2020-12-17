
// things everyone can config

export
const QUALITY_REPORT_INTERVAL = 1000,
      NETWORK_STATS_INTERVAL  = 1000,

      LOG_ENABLED             = false;





// things an expert can config

export
const NUM_SYNC_PACKETS          = 5,

      SYNC_RETRY_INTERVAL       = 2000,
      SYNC_FIRST_RETRY_INTERVAL = 200,
      RUNNING_RETRY_INTERVAL    = 200,

      KEEP_ALIVE_INTERVAL       = 200,

      SHUTDOWN_TIMER            = 5000;





// things that shouldn't be configged

export
const MAX_PREDICTION_FRAMES = 8,
      INPUT_QUEUE_LENGTH    = 128;
