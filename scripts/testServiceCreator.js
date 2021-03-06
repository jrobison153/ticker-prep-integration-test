import mongodb from 'mongodb';
import redis from 'redis';
import requestPromise from 'request-promise';
import TickerDataSource from '../src/TickerDataSource';
import HopperIntegration from '../src/HopperIntegration';
import TestService from '../src/TestService';
import EventHandler from '../src/EventHandler';
import TickerDecorationTester from '../src/TickerDecorationTester';
import BatchProcessingStartedTester from '../src/BatchProcessingStartedTester';
import TickersDecoratedTester from '../src/TickersDecoratedTester';

const dataSource = new TickerDataSource(mongodb);


const perpetualRetryStrategy = (options) => {

  const retryAfterSeconds = 5000;

  if (options.error && options.error.code) {

    console.info(`Redis connection error '${options.error.code}', retrying in ${retryAfterSeconds}ms ...`);
  } else {

    console.info(`Unknown Redis connection issue, retrying in ${retryAfterSeconds}ms ...`);
  }

  return retryAfterSeconds;
};

module.exports = () => {

  return dataSource.connect().then(() => {

    const hopperIntegration = new HopperIntegration(requestPromise);

    let host = 'localhost';

    if (process.env.DOCTOR_REDIS_CONNECTION_HOST) {

      host = process.env.DOCTOR_REDIS_CONNECTION_HOST;
    }

    let port = '6379';

    if (process.env.DOCTOR_REDIS_CONNECTION_PORT) {

      port = process.env.DOCTOR_REDIS_CONNECTION_PORT;
    }

    const redisClient = redis.createClient(port, host, { retry_strategy: perpetualRetryStrategy });

    const eventHandler = new EventHandler(redisClient);

    const decorationTester = new TickerDecorationTester(dataSource);
    const batchProcessingStartedTester = new BatchProcessingStartedTester(eventHandler);
    const tickersDecoratedTester = new TickersDecoratedTester(eventHandler);
    const testers = [];
    testers.push(decorationTester);
    testers.push(batchProcessingStartedTester);
    testers.push(tickersDecoratedTester);

    return new TestService(dataSource, hopperIntegration, testers, {});
  });
};
