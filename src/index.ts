#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CURRENT_TIME, DAYS_IN_MONTH, GET_TIMESTAMP, RELATIVE_TIME, CONVERT_TIME, GET_WEEK_YEAR } from './tools.js';
import relativeTime from 'dayjs/plugin/relativeTime.js';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';
import weekOfYear from 'dayjs/plugin/weekOfYear.js';
import isoWeek from 'dayjs/plugin/isoWeek.js';
import dayjs from 'dayjs';

dayjs.extend(relativeTime);
dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(weekOfYear);
dayjs.extend(isoWeek);

export const server = new Server({
  name: 'time-mcp',
  version: '0.0.1',
}, {
  capabilities: {
    tools: {},
    logging: {},
  },
});

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [CURRENT_TIME, RELATIVE_TIME, DAYS_IN_MONTH, GET_TIMESTAMP, CONVERT_TIME, GET_WEEK_YEAR],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  try {
    switch (name) {
      case 'current_time': {
        if (!checkCurrentTimeArgs(args)) {
          throw new Error(`Invalid arguments for tool: [${name}]`);
        }

        const { format, timezone } = args;
        const result = getCurrentTime(format, timezone);
        return {
          success: true,
          content: [
            {
              type: 'text',
              text: `Current UTC time is ${result.utc}, and the time in ${result.timezone} is ${result.local}.`,
            },
          ],
        };
      }
      case 'relative_time': {
        if (!checkRelativeTimeArgs(args)) {
          throw new Error(`Invalid arguments for tool: [${name}]`);
        }

        const time = args.time;
        const result = getRelativeTime(time);
        return {
          success: true,
          content: [
            {
              type: 'text',
              text: result,
            },
          ],
        };
      }
      case 'days_in_month': {
        if (!checkDaysInMonthArgs(args)) {
          throw new Error(`Invalid arguments for tool: [${name}]`);
        }

        const date = args.date;
        const result = getDaysInMonth(date);
        return {
          success: true,
          content: [
            {
              type: 'text',
              text: `The number of days in month is ${result}.`,
            },
          ],
        };
      }
      case 'get_timestamp': {
        if (!checkTimestampArgs(args)) {
          throw new Error(`Invalid arguments for tool: [${name}]`);
        }
        const time = args.time;
        const result = getTimestamp(time);
        return {
          success: true,
          content: [
            {
              type: 'text',
              text: time 
                ? `The timestamp of ${time} (parsed as UTC) is ${result} ms.`
                : `The current timestamp is ${result} ms.`,
            },
          ],
        };
      }
      case 'convert_time': {
        if (!checkConvertTimeArgs(args)) {
          throw new Error(`Invalid arguments for tool: [${name}]`);
        }
        const { sourceTimezone, targetTimezone, time } = args;
        const { sourceTime, targetTime, timeDiff } = convertTime(sourceTimezone, targetTimezone, time);
        return {
          success: true,
          content: [
            {
              type: 'text',
              text: `Current time in ${sourceTimezone} is ${sourceTime}, and the time in ${targetTimezone} is ${targetTime}. The time difference is ${timeDiff} hours.`,
            },
          ],
        };
      }
      case 'get_week_year': {
        if (!checkWeekOfYearArgs(args)) {
          throw new Error(`Invalid arguments for tool: [${name}]`);
        }
        const { date } = args;
        const { week, isoWeek } = getWeekOfYear(date);
        return {
          success: true,
          content: [
            {
              type: 'text',
              text: `The week of the year is ${week}, and the isoWeek of the year is ${isoWeek}.`,
            },
          ],
        };
      }
      default: {
        throw new Error(`Unknown tool: ${name}`);
      }
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);

    return {
      success: false,
      content: [
        {
          type: 'text',
          text: message,
        },
      ],
    };
  }
});

function getCurrentTime(format: string, timezone?: string) {
  const utcTime = dayjs.utc();
  const localTimezone = timezone ?? dayjs.tz.guess();
  const localTime = dayjs().tz(localTimezone);
  return {
    utc: utcTime.format(format),
    local: localTime.format(format),
    timezone: localTimezone,
  };
}

function getRelativeTime(time: string) {
  return dayjs(time).fromNow();
}

function getTimestamp(time?: string) {
  return time ? dayjs.utc(time).valueOf() : dayjs().valueOf();
}

function getDaysInMonth(date?: string) {
  return date ? dayjs(date).daysInMonth() : dayjs().daysInMonth();
}

function getWeekOfYear(date?: string) {
  const week =  date ? dayjs(date).week() : dayjs().week();
  const isoWeek = date ? dayjs(date).isoWeek() : dayjs().isoWeek();
  return {
    week,
    isoWeek,
  };
}

function convertTime(sourceTimezone: string, targetTimezone: string, time?: string) {
  const sourceTime = time ? dayjs(time).tz(sourceTimezone) : dayjs().tz(sourceTimezone);
  const targetTime = sourceTime.tz(targetTimezone);
  const formatString = 'YYYY-MM-DD HH:mm:ss';
  return {
    sourceTime: sourceTime.format(formatString),
    targetTime: targetTime.format(formatString),
    timeDiff: dayjs(targetTime).diff(dayjs(sourceTime), 'hours'),
  };
}

function checkCurrentTimeArgs(args: unknown): args is { format: string, timezone?: string } {
  return (
    typeof args === 'object' &&
    args !== null &&
    'format' in args &&
    typeof args.format === 'string' &&
    ('timezone' in args ? typeof args.timezone === 'string' : true)
  );
}

function checkRelativeTimeArgs(args: unknown): args is { time: string } {
  return (
    typeof args === 'object' &&
    args !== null &&
    'time' in args &&
    typeof args.time === 'string'
  );
}

function checkDaysInMonthArgs(args: unknown): args is { date: string } {
  return (
    typeof args === 'object' &&
    args !== null &&
    'date' in args &&
    typeof args.date === 'string'
  );
}

function checkTimestampArgs(args: unknown): args is { time?: string } {
  if (args === undefined || args === null) {
    return true;
  }
  return (
    typeof args === 'object' &&
    (!('time' in (args as Record<string, unknown>)) || typeof (args as { time?: unknown }).time === 'string')
  );
}

function checkConvertTimeArgs(args: unknown): args is { sourceTimezone: string, targetTimezone: string, time: string } {
  return (
    typeof args === 'object' &&
    args !== null &&
    'sourceTimezone' in args &&
    typeof args.sourceTimezone === 'string' &&
    'targetTimezone' in args &&
    typeof args.targetTimezone === 'string' &&
    'time' in args &&
    typeof args.time === 'string'
  );
}

function checkWeekOfYearArgs(args: unknown): args is { date: string } {
  return (
    typeof args === 'object' &&
    args !== null &&
    ('date' in args ? typeof args.date === 'string' : true)
  );
}

async function runServer() {
  try {

    process.stdout.write('Starting Time MCP server...\n');
    const transport = new StdioServerTransport();
    await server.connect(transport);

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`Error starting Time MCP server: ${message}\n`);
    process.exit(1);
  }
}

runServer().catch(error => {
  const errorMessage = error instanceof Error ? error.message : String(error);
  process.stderr.write(`Error running Time MCP server: ${errorMessage}\n`);
  process.exit(1);
});