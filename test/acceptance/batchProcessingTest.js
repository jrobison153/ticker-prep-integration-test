/* eslint-disable no-unused-expressions */
import requestPromise from 'request-promise';
import { expect } from 'chai';
import TestService from '../../src/TestService';
import TickerDataSource from '../../src/TickerDataSource';
import HopperIntegration from '../../src/HopperIntegration';
import mongoFake from '../../fake/mongo/mongoFake';
import RequestSpy from '../spy/RequestSpy';
import EventHandler from '../../src/EventHandler';
import RedisClientFake from '../../fake/redis/RedisClientFake';

const server = require('../../src/server');

describe('Doctor Acceptance Tests', () => {

  const requestOptions = {
    method: 'POST',
    uri: 'http://localhost:8080/test',
    resolveWithFullResponse: true,
  };

  let eventHandler;

  before(() => {

    const redisFake = new RedisClientFake();
    eventHandler = new EventHandler(redisFake);
    redisFake.publish('TICKER_BATCH_PROCESSING', JSON.stringify({ name: 'BATCH_TICKER_PROCESSING_STARTED' }));
  });

  describe('given a healthy Kaching system where batch processing is successful', () => {

    describe('when a test is executed', () => {

      let response;
      let body;

      before(async () => {

        const dataSource = new TickerDataSource(mongoFake);

        await dataSource.connect();

        const requestSpy = new RequestSpy();
        const hopperIntegration = new HopperIntegration(requestSpy.request.bind(requestSpy));

        const testService = new TestService(dataSource, hopperIntegration, eventHandler);

        await server.start(testService);

        response = await requestPromise(requestOptions);
        body = JSON.parse(response.body);

        return response;
      });

      after(() => {

        server.stop();
        mongoFake.reset();
      });


      it('returns an HTTP status code 200', () => {

        expect(response.statusCode).to.equal(200);
      });

      it('returns a test status of passed', () => {

        expect(body.testStatus).to.equal('passed');
      });

      it('returns the BATCH_TICKER_PROCESSING_STARTED event with a count of 1', () => {

        const testResult = body.results.find((result) => {

          return result.test === 'Batch Processing Started Event';
        });

        expect(testResult).to.be.ok;
        expect(testResult.success).to.be.true;
        expect(testResult.received).to.equal(1);
        expect(testResult.expected).to.equal(1);
      });
    });
  });

  describe('given an unhealthy Kaching system where batch processing is unsuccessful', () => {

    describe('when a test is executed', () => {

      before(async () => {

        const fakeMongoDb = await mongoFake.MongoClient.connect();
        const fakeCollection = fakeMongoDb.collection();
        fakeCollection.setupForFailedDecoration();

        const dataSource = new TickerDataSource(mongoFake);

        await dataSource.connect();

        const requestSpy = new RequestSpy();
        const hopperIntegration = new HopperIntegration(requestSpy.request.bind(requestSpy));

        const retryOptions = {
          attempts: 2,
          wait: 10,
        };

        const testService = new TestService(dataSource, hopperIntegration, eventHandler, retryOptions);
        return server.start(testService);
      });

      after(() => {

        server.stop();
        mongoFake.reset();
      });

      it('then an HTTP status code 200 is returned with a test status of failed', () => {

        return requestPromise(requestOptions).then((response) => {

          expect(response.statusCode).to.equal(200);

          const body = JSON.parse(response.body);

          expect(body.testStatus).to.equal('failed');
        });
      });
    });
  });
});

