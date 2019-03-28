'use strict'

const test = require('ava').test
const sinon = require('sinon')
const Slapp = require('../src/slapp')
const Message = require('../src/message')
const fixtures = require('./fixtures/')

const meta = {
  app_token: 'app_token',
  team_id: 'team_id',
  channel_id: 'channel_id',
  user_id: 'user_id',
  app_bot_id: 'app_bot_id'
}

test('Slapp()', t => {
  let options = {
    log: true,
    colors: true,
    verify_token: 'verify_token',
    convo_store: () => {},
    context
  }

  let app = new Slapp(options)

  t.is(app.log, options.log)
  t.is(app.convoStore, options.convo_store)
  t.is(app.verify_token, options.verify_token)
  t.is(typeof app.client, 'object')
  t.is(typeof app.receiver, 'object')
  t.true(Array.isArray(app._middleware))
  t.is(app._middleware.length, 0)
  t.is(typeof app.emit, 'function')
})

test('Slapp() w/o context', t => {
  t.throws(() => {
    let app = new Slapp()
    t.is(null, app)
    t.fail()
  })
})

test('Slapp.use()', t => {
  let mw = () => {}
  let app = new Slapp({ context })

  t.is(app._middleware.length, 0)

  app.use(mw)

  t.is(app._middleware.length, 1)
  t.deepEqual(app._middleware, [mw])
})

test('Slapp() convo_store string', t => {
  let app = new Slapp({
    context,
    convo_store: 'memory'
  })

  t.is(typeof app.convoStore, 'object')
})

test('Slapp.init()', t => {
  let app = new Slapp({ context })

  app.init()

  t.is(app._middleware.length, 2)
})

test('Slapp.init() w/ ignoreSelf false', t => {
  let app = new Slapp({ context, ignoreSelf: false })

  app.init()

  t.is(app._middleware.length, 1)
})

test('Slapp.init() w/ ignoreBots true', t => {
  let app = new Slapp({ context, ignoreBots: true })

  app.init()

  t.is(app._middleware.length, 3)
})

test('Slapp.attachToExpress()', t => {
  let app = new Slapp({ context })
  let stub = sinon.stub(app.receiver, 'attachToExpress')

  app.attachToExpress({})

  t.true(stub.calledOnce)
})

test('Slapp.route()', t => {
  let app = new Slapp({ context })
  let key = 'routeKey'
  let fn = () => {}

  app.route(key, fn)

  t.deepEqual(app._registry[key], fn)
})

test('Slapp.getRoute()', t => {
  let app = new Slapp({ context })
  let key = 'routeKey'
  let fn = () => {}

  app.route(key, fn)

  t.deepEqual(app.getRoute(key), fn)
})

test('Slapp.match()', t => {
  let app = new Slapp({ context })
  let fn = () => {}

  t.is(app._matchers.length, 0)

  app.match(fn)

  t.is(app._matchers.length, 1)
  t.deepEqual(app._matchers, [fn])
})

test.cb('Slapp._handle() w/ a bad message', t => {
  t.plan(2)

  let app = new Slapp({ context })
  let message = new Message('event', {}, {})

  let emitSpy = sinon.stub(app, 'emit')
  app._handle(message, (err) => {
    t.is(err, null)
    t.true(emitSpy.calledWith('error'))
    t.end()
  })
})

test.cb('Slapp._handle() 1 mw, no override, no matchers', t => {
  t.plan(4)

  let app = new Slapp({ context })
  let message = new Message('event', {}, meta)
  let attachSlappStub = sinon.stub(message, 'attachSlapp')

  app.use((msg, next) => {
    t.deepEqual(msg, message)

    next()
  })

  app._handle(message, (err, handled) => {
    t.true(attachSlappStub.calledOnce)
    t.is(err, null)
    t.false(handled)
    t.end()
  })
})

test('Slapp._handle() no callback provided', t => {
  let app = new Slapp({ context })
  let message = new Message('event', {}, meta)
  let attachSlappStub = sinon.stub(message, 'attachSlapp')

  app._handle(message)

  t.true(attachSlappStub.calledOnce)
})

test.cb('Slapp._handle() 1 mw, no override, 1 matchers', t => {
  t.plan(4)

  let app = new Slapp({ context })
  let message = new Message('event', {}, meta)
  let attachSlappStub = sinon.stub(message, 'attachSlapp')

  app
    .use((msg, next) => {
      t.deepEqual(msg, message)

      next()
    })
    .match((msg) => {
      return true
    })

  app._handle(message, (err, handled) => {
    t.true(attachSlappStub.calledOnce)
    t.is(err, null)
    t.true(handled)
    t.end()
  })
})

test.cb('Slapp._handle() no mw, with override, no matchers', t => {
  t.plan(5)

  let app = new Slapp({ context })
  let message = new Message('event', {}, meta)
  message.override = (msg) => {
    t.deepEqual(msg, message)
  }
  let attachSlappStub = sinon.stub(message, 'attachSlapp')
  let delSpy = sinon.spy(app.convoStore, 'del')

  app._handle(message, (err, handled) => {
    t.true(attachSlappStub.calledOnce)
    t.is(err, null)
    t.true(handled)
    t.true(delSpy.calledWith(message.conversation_id))

    t.end()
  })
})

test.cb('Slapp._handle() with override and del error', t => {
  t.plan(6)

  let app = new Slapp({ context })
  let message = new Message('event', {}, meta)
  message.conversation_id = 'asdf'
  message.override = (msg) => {
    t.deepEqual(msg, message)
  }
  let attachSlappStub = sinon.stub(message, 'attachSlapp')
  let emitSpy = sinon.stub(app, 'emit')
  let delStub = sinon.stub(app.convoStore, 'del', (id, cb) => {
    cb(new Error('kaboom'))
  })

  app._handle(message, (err, handled) => {
    t.true(attachSlappStub.calledOnce)
    t.is(err.message, 'kaboom')
    t.true(handled)
    t.true(delStub.calledWith(message.conversation_id))
    t.true(emitSpy.calledWith('error'))

    t.end()
  })
})

test.cb('Slapp._handle() w/ attached response', t => {
  t.plan(2)

  let app = new Slapp({ context })
  let message = new Message('event', {}, meta)
  let res = fixtures.getMockRes()
  message.attachResponse(res, 100)

  let clearResponseStub = sinon.stub(message, 'clearResponse')

  app._handle(message, (err) => {
    t.is(err, null)
    t.true(clearResponseStub.calledOnce)
    t.end()
  })
})

test.cb('Slapp.command() w/o criteria', t => {
  t.plan(3)

  let app = new Slapp({ context })
  let message = new Message('command', {
    command: 'test'
  }, meta)

  app
    .command(message.body.command, (msg) => {
      t.deepEqual(msg, message)
    })
    ._handle(message, (err, handled) => {
      t.is(err, null)
      t.true(handled)
      t.end()
    })
})

test.cb('Slapp.command() w/ command regex', t => {
  t.plan(3)

  let app = new Slapp({ context })
  let message = new Message('command', {
    command: '/test',
    text: 'hello'
  }, meta)

  app
    .command(/\/tes.*/, /llo$/, (msg) => {
      t.deepEqual(msg, message)
    })
    ._handle(message, (err, handled) => {
      t.is(err, null)
      t.true(handled)
      t.end()
    })
})

test.cb('Slapp.command() w/ command string regex', t => {
  t.plan(3)

  let app = new Slapp({ context })
  let message = new Message('command', {
    command: '/test',
    text: 'hello'
  }, meta)

  app
    .command('/tes.*', /llo$/, (msg) => {
      t.deepEqual(msg, message)
    })
    ._handle(message, (err, handled) => {
      t.is(err, null)
      t.true(handled)
      t.end()
    })
})

test.cb('Slapp.command() w/ command string regex and redundant ^$', t => {
  t.plan(3)

  let app = new Slapp({ context })
  let message = new Message('command', {
    command: '/test',
    text: 'hello'
  }, meta)

  app
    .command('^^/test$$', /llo$/, (msg) => {
      t.deepEqual(msg, message)
    })
    ._handle(message, (err, handled) => {
      t.is(err, null)
      t.true(handled)
      t.end()
    })
})

test.cb('Slapp.command() w/ criteria string', t => {
  t.plan(3)

  let app = new Slapp({ context })
  let message = new Message('command', {
    command: 'test',
    text: 'hello'
  }, meta)

  app
    .command(message.body.command, 'hel', (msg) => {
      t.deepEqual(msg, message)
    })
    ._handle(message, (err, handled) => {
      t.is(err, null)
      t.true(handled)
      t.end()
    })
})

test.cb('Slapp.command() w/ criteria regex', t => {
  t.plan(3)

  let app = new Slapp({ context })
  let message = new Message('command', {
    command: 'test',
    text: 'hello'
  }, meta)

  app
    .command(message.body.command, /llo$/, (msg) => {
      t.deepEqual(msg, message)
    })
    ._handle(message, (err, handled) => {
      t.is(err, null)
      t.true(handled)
      t.end()
    })
})

test.cb('Slapp.command() w/ criteria matcher', t => {
  t.plan(6)

  let app = new Slapp({ context })
  let message = new Message('command', {
    command: 'test',
    text: 'one two'
  }, meta)

  app
    .command(message.body.command, '([oO]ne) ([tT]wo)', (msg, text, match1, match2) => {
      t.deepEqual(msg, message)
      t.is(text, message.body.text)
      t.is(match1, 'one')
      t.is(match2, 'two')
    })
    ._handle(message, (err, handled) => {
      t.is(err, null)
      t.true(handled)
      t.end()
    })
})

test.cb('Slapp.command() w/ non-matching string criteria', t => {
  t.plan(2)

  let app = new Slapp({ context })
  let message = new Message('command', {
    command: 'test',
    text: 'hello'
  }, meta)

  app
    .command(message.body.command, 'derp', () => {})
    ._handle(message, (err, handled) => {
      t.is(err, null)
      t.false(handled)
      t.end()
    })
})

test.cb('Slapp.command() w/ non-matching regex criteria', t => {
  t.plan(2)

  let app = new Slapp({ context })
  let message = new Message('command', {
    command: 'test',
    text: 'hello'
  }, meta)

  app
    .command(message.body.command, /^derp$/, () => {})
    ._handle(message, (err, handled) => {
      t.is(err, null)
      t.false(handled)
      t.end()
    })
})

test.cb('Slapp.action() non-matching no actions', t => {
  t.plan(2)

  let app = new Slapp({ context })
  let message = new Message('action', {
    callback_id: 'my_callback',
    command: 'test'
  }, meta)

  app
    .action(message.body.callback_id, (msg) => {})
    ._handle(message, (err, handled) => {
      t.is(err, null)
      t.false(handled)
      t.end()
    })
})

test.cb('Slapp.action() non-matching criteria', t => {
  t.plan(2)

  let app = new Slapp({ context })
  let message = new Message('action', {
    actions: [
      { name: 'beep' }
    ],
    callback_id: 'my_callback',
    command: 'test'
  }, meta)

  app
    .action('mismatch', (msg) => { })
    ._handle(message, (err, handled) => {
      t.is(err, null)
      t.false(handled)
      t.end()
    })
})

test.cb('Slapp.action() w/o criteria', t => {
  t.plan(3)

  let app = new Slapp({ context })
  let message = new Message('action', {
    actions: [
      { name: 'beep' }
    ],
    callback_id: 'my_callback',
    command: 'test'
  }, meta)

  app
    .action(message.body.callback_id, (msg) => {
      t.deepEqual(msg, message)
    })
    ._handle(message, (err, handled) => {
      t.is(err, null)
      t.true(handled)
      t.end()
    })
})

test.cb('Slapp.action() w/ name criteria string', t => {
  t.plan(3)

  let app = new Slapp({ context })
  let message = new Message('action', {
    actions: [
      { name: 'beep' }
    ],
    callback_id: 'my_callback',
    command: 'test'
  }, meta)

  app
    .action(message.body.callback_id, 'beep', (msg) => {
      t.deepEqual(msg, message)
    })
    ._handle(message, (err, handled) => {
      t.is(err, null)
      t.true(handled)
      t.end()
    })
})

test.cb('Slapp.action() w/ name and value criteria string', t => {
  t.plan(3)

  let app = new Slapp({ context })
  let message = new Message('action', {
    actions: [
      { name: 'beep', value: 'boop' }
    ],
    callback_id: 'my_callback',
    command: 'test'
  }, meta)

  app
    .action(message.body.callback_id, 'beep', 'boop', (msg) => {
      t.deepEqual(msg, message)
    })
    ._handle(message, (err, handled) => {
      t.is(err, null)
      t.true(handled)
      t.end()
    })
})

test.cb('Slapp.action() w/ name and value criteria regex', t => {
  t.plan(3)

  let app = new Slapp({ context })
  let message = new Message('action', {
    actions: [
      { name: 'beep', value: 'Boop' }
    ],
    callback_id: 'my_callback',
    command: 'test'
  }, meta)

  app
    .action(message.body.callback_id, /^beep.*/, /B[o]{2}p/, (msg) => {
      t.deepEqual(msg, message)
    })
    ._handle(message, (err, handled) => {
      t.is(err, null)
      t.true(handled)
      t.end()
    })
})

test.cb('Slapp.action() w/ non-matching criteria', t => {
  t.plan(2)

  let app = new Slapp({ context })
  let message = new Message('action', {
    actions: [
      { name: 'beep' }
    ],
    callback_id: 'my_callback',
    command: 'test'
  }, meta)

  app
    .action(message.body.callback_id, 'boop', () => {})
    ._handle(message, (err, handled) => {
      t.is(err, null)
      t.false(handled)
      t.end()
    })
})

test.cb('Slapp.action() w/ selected_options', t => {
  t.plan(5)

  let app = new Slapp({ context })
  let message = new Message('action', {
    actions: [
      { name: 'beep', selected_options: [{ value: 'no match' }, { value: 'Boop' }] }
    ],
    callback_id: 'my_callback'
  }, meta)

  app
    .action(message.body.callback_id, /^beep.*/, /B[o]{2}p/, (msg, val) => {
      t.deepEqual(msg, message)
      t.true(Array.isArray(val))
      t.deepEqual(val, ['no match', 'Boop'])
    })
    ._handle(message, (err, handled) => {
      t.is(err, null)
      t.true(handled)
      t.end()
    })
})

test.cb('Slapp.action() w/ selected_options no matches', t => {
  t.plan(2)

  let app = new Slapp({ context })
  let message = new Message('action', {
    actions: [
      { name: 'beep', selected_options: [{ value: 'no match' }] }
    ],
    callback_id: 'my_callback'
  }, meta)

  app
    .action(message.body.callback_id, /^beep.*/, /B[o]{2}p/, (msg, val) => {})
    ._handle(message, (err, handled) => {
      t.is(err, null)
      t.false(handled)
      t.end()
    })
})

test.cb('Slapp.action() w/ callback URL', t => {
  t.plan(5)

  let app = new Slapp({ context })
  let callbackIdCriteria = '/account/:one/:two'
  let message = new Message('action', {
    actions: [
      { name: 'beep', value: 'boop' }
    ],
    callback_id: '/account/foo/bar',
    command: 'test'
  }, meta)

  app
    .action(callbackIdCriteria, (msg) => {
      t.deepEqual(msg, message)
      t.is(msg.meta.params.one, 'foo')
      t.is(msg.meta.params.two, 'bar')
    })
    ._handle(message, (err, handled) => {
      t.is(err, null)
      t.true(handled)
      t.end()
    })
})

test.cb('Slapp.action() w/ callback URL with large encoded value', t => {
  t.plan(5)

  let app = new Slapp({ context })
  let longValue = 'long with spaces ?/:¡™£¢∞§¶•ªº–:{"x:":"y"}'
  let longValueEncoded = encodeURIComponent(longValue)
  let callbackIdCriteria = '/account/:one/:two'
  let message = new Message('action', {
    actions: [
      { name: 'beep', value: 'boop' }
    ],
    callback_id: `/account/foo/${longValueEncoded}`,
    command: 'test'
  }, meta)

  app
    .action(callbackIdCriteria, (msg) => {
      t.deepEqual(msg, message)
      t.is(msg.meta.params.one, 'foo')
      t.is(msg.meta.params.two, longValueEncoded)
    })
    ._handle(message, (err, handled) => {
      t.is(err, null)
      t.true(handled)
      t.end()
    })
})

test.cb('Slapp.messageAction() w/ no match not message_action', t => {
  t.plan(2)

  let app = new Slapp({ context })
  let message = new Message('action', {
    type: 'not_message_action',
    callback_id: 'my_callback'
  }, meta)

  app
    .messageAction(message.body.callback_id, (msg, messageParsed) => { })
    ._handle(message, (err, handled) => {
      t.is(err, null)
      t.false(handled)
      t.end()
    })
})

test.cb('Slapp.messageAction() w/ no match on callback_id', t => {
  t.plan(2)

  let app = new Slapp({ context })
  let message = new Message('action', {
    type: 'message_action',
    callback_id: 'my_callback'
  }, meta)

  app
    .messageAction('no_match', (msg, messageParsed) => {
      t.fail('messageAction should not be called when no match')
    })
    ._handle(message, (err, handled) => {
      t.is(err, null)
      t.false(handled)
      t.end()
    })
})

test.cb('Slapp.messageAction() w/ match', t => {
  t.plan(3)

  let app = new Slapp({ context })
  let message = new Message('action', {
    type: 'message_action',
    callback_id: 'my_callback',
    message: {
      ts: 'ts'
    }
  }, meta)

  app
    .messageAction(message.body.callback_id, (msg, messageParsed) => {
      t.deepEqual(message.body.message, messageParsed)
    })
    ._handle(message, (err, handled) => {
      t.is(err, null)
      t.true(handled)
      t.end()
    })
})

test.cb('Slapp.message() w/o filter', t => {
  t.plan(3)

  let app = new Slapp({ context })
  let message = new Message('event', {
    event: {
      type: 'message',
      text: 'beep boop'
    }
  }, meta)

  app
    .message('beep', (msg) => {
      t.deepEqual(msg, message)
    })
    ._handle(message, (err, handled) => {
      t.is(err, null)
      t.true(handled)
      t.end()
    })
})

test.cb('Slapp.message() w/ matchers', t => {
  t.plan(6)

  let app = new Slapp({ context })
  let message = new Message('event', {
    event: {
      type: 'message',
      text: 'beep one Two'
    }
  }, meta)

  app
    .message('beep ([oO]ne) ([tT]wo)', (msg, text, match1, match2) => {
      t.deepEqual(msg, message)
      t.is(text, 'beep one Two')
      t.is(match1, 'one')
      t.is(match2, 'Two')
    })
    ._handle(message, (err, handled) => {
      t.is(err, null)
      t.true(handled)
      t.end()
    })
})

test.cb('Slapp.message() w/ filter', t => {
  t.plan(3)

  let app = new Slapp({ context })
  let message = new Message('event', {
    event: {
      type: 'message',
      text: 'beep boop'
    }
  }, meta)

  app
    .message('beep', 'ambient', (msg) => {
      t.deepEqual(msg, message)
    })
    ._handle(message, (err, handled) => {
      t.is(err, null)
      t.true(handled)
      t.end()
    })
})

test.cb('Slapp.event() w/ string criteria', t => {
  t.plan(3)

  let app = new Slapp({ context })
  let message = new Message('event', {
    event: {
      type: 'message',
      text: 'beep boop'
    }
  }, meta)

  app
    .event('message', (msg) => {
      t.deepEqual(msg, message)
    })
    ._handle(message, (err, handled) => {
      t.is(err, null)
      t.true(handled)
      t.end()
    })
})

test.cb('Slapp.event() w/ regex criteria', t => {
  t.plan(3)

  let app = new Slapp({ context })
  let message = new Message('event', {
    event: {
      type: 'message',
      text: 'beep boop'
    }
  }, meta)

  app
    .event(/^mess/, (msg) => {
      t.deepEqual(msg, message)
    })
    ._handle(message, (err, handled) => {
      t.is(err, null)
      t.true(handled)
      t.end()
    })
})

test.cb('Slapp._handle() w/ init()', t => {
  t.plan(3)

  let app = new Slapp({ context })
  let message = new Message('event', {
    event: {
      type: 'message',
      text: 'beep boop'
    }
  }, meta)

  app
    .init()
    .event('message', (msg) => {
      t.deepEqual(msg, message)
    })
    ._handle(message, (err, handled) => {
      t.is(err, null)
      t.true(handled)
      t.end()
    })
})

test.cb('Slapp.ignoreBotsMiddleware() with bot_message and bot_id', t => {
  let app = new Slapp({ context })
  let mw = app.ignoreBotsMiddleware()

  let message = new Message('event', {
    event: {
      type: 'message',
      subtype: 'bot_message'
    }
  }, {
    bot_id: 'asdf'
  })

  // this callback is synchronous
  mw(message, () => {
    t.fail()
  })
  t.pass()
  t.end()
})

test.cb('Slapp.ignoreBotsMiddleware() with bot_message no bot_id', t => {
  let app = new Slapp({ context })
  let mw = app.ignoreBotsMiddleware()

  let message = new Message('event', {
    event: {
      type: 'message',
      subtype: 'bot_message'
    }
  }, {})

  // this callback is synchronous
  mw(message, () => {
    t.pass()
    t.end()
  })
})

test.cb('Slapp.ignoreBotsMiddleware() w/o bot message', t => {
  let app = new Slapp({ context })
  let mw = app.ignoreBotsMiddleware()

  let message = new Message('event', {}, meta)

  // this callback is synchronous
  mw(message, () => {
    t.pass()
    t.end()
  })
})

test.cb('Slapp.ignoreSelfMiddleware() with bot_message and matching bot_id', t => {
  let app = new Slapp({ context })
  let mw = app.ignoreSelfMiddleware()

  let message = new Message('event', {
    event: {
      type: 'message',
      subtype: 'bot_message'
    }
  }, {
    bot_id: 'app_bot_id',
    app_bot_id: 'app_bot_id'
  })

  // this callback is synchronous
  mw(message, () => {
    t.fail()
  })
  t.pass()
  t.end()
})

test.cb('Slapp.ignoreSelfMiddleware() with bot_message and non-matching bot_id', t => {
  let app = new Slapp({ context })
  let mw = app.ignoreSelfMiddleware()

  let message = new Message('event', {
    event: {
      type: 'message',
      subtype: 'bot_message'
    }
  }, {
    bot_id: 'other_bot_id',
    app_bot_id: 'app_bot_id'
  })

  // this callback is synchronous
  mw(message, () => {
    t.pass()
    t.end()
  })
})

test.cb('Slapp.ignoreSelfMiddleware() without bot_message', t => {
  let app = new Slapp({ context })
  let mw = app.ignoreSelfMiddleware()

  let message = new Message('event', {
    event: {
      type: 'message'
    }
  }, {
    app_bot_id: 'app_bot_id'
  })

  // this callback is synchronous
  mw(message, () => {
    t.pass()
    t.end()
  })
})

test.cb('Slapp.ignoreSelfMiddleware() both ids falsey', t => {
  let app = new Slapp({ context })
  let mw = app.ignoreSelfMiddleware()

  let message = new Message('event', {
    event: {
      type: 'message',
      subtype: 'bot_message'
    }
  }, {
    bot_id: null,
    app_bot_id: null
  })

  // this callback is synchronous
  mw(message, () => {
    t.pass()
    t.end()
  })
})

test.cb('Slapp.ignoreSelfMiddleware() one id falsey', t => {
  let app = new Slapp({ context })
  let mw = app.ignoreSelfMiddleware()

  let message = new Message('event', {
    event: {
      type: 'message',
      subtype: 'bot_message'
    }
  }, {
    bot_id: 'bot_id',
    app_bot_id: null
  })

  // this callback is synchronous
  mw(message, () => {
    t.pass()
    t.end()
  })
})

test.cb('Slapp.preprocessConversationMiddleware() w/ conversation', t => {
  t.plan(3)

  let app = new Slapp({ context })
  let mw = app.preprocessConversationMiddleware()
  let message = new Message('event', {}, meta)
  message.conversation_id = 'convo_id'
  let convo = {
    fnKey: 'next-route',
    state: {
      beep: 'boop'
    }
  }

  let overrideStub = sinon.stub(message, 'attachOverrideRoute')
  let getStub = sinon.stub(app.convoStore, 'get', (id, cb) => {
    t.is(id, message.conversation_id)

    cb(null, convo)
  })

  mw(message, () => {
    t.true(overrideStub.calledWith(convo.fnKey, convo.state))
    t.true(getStub.calledOnce)
    t.end()
  })
})

test.cb('Slapp.preprocessConversationMiddleware() w/o conversation', t => {
  t.plan(3)

  let app = new Slapp({ context })
  let mw = app.preprocessConversationMiddleware()
  let message = new Message('event', {}, meta)
  message.conversation_id = 'convo_id'

  let overrideStub = sinon.stub(message, 'attachOverrideRoute')
  let getStub = sinon.stub(app.convoStore, 'get', (id, cb) => {
    t.is(id, message.conversation_id)

    cb(null, null)
  })

  mw(message, () => {
    t.false(overrideStub.called)
    t.true(getStub.calledOnce)
    t.end()
  })
})

test.cb('Slapp.preprocessConversationMiddleware() w/ error', t => {
  t.plan(4)

  let app = new Slapp({ context })
  let mw = app.preprocessConversationMiddleware()
  let message = new Message('event', {}, meta)
  message.conversation_id = 'convo_id'

  let emitSpy = sinon.stub(app, 'emit')
  let overrideStub = sinon.stub(message, 'attachOverrideRoute')
  let getStub = sinon.stub(app.convoStore, 'get', (id, cb) => {
    t.is(id, message.conversation_id)

    cb(new Error('kaboom'))
  })

  mw(message, () => t.fail())

  t.false(overrideStub.called)
  t.true(getStub.calledOnce)
  t.true(emitSpy.calledWith('error'))
  t.end()
})

test.cb('Slapp.options() w/ callback_id only', t => {
  t.plan(3)

  let app = new Slapp({ context })
  let message = new Message('options', {
    callback_id: 'my_callback'
  }, meta)

  app
    .options('my_callback', (msg) => {
      t.deepEqual(msg, message)
    })
    ._handle(message, (err, handled) => {
      t.is(err, null)
      t.true(handled)
      t.end()
    })
})

test.cb('Slapp.options() w/ string criteria', t => {
  t.plan(4)

  let app = new Slapp({ context })
  let message = new Message('options', {
    name: 'my_name',
    value: 'my_value',
    callback_id: 'my_callback'
  }, meta)

  app
    .options('my_callback', 'my_name', (msg, val) => {
      t.deepEqual(msg, message)
      t.is(val, 'my_value')
    })
    ._handle(message, (err, handled) => {
      t.is(err, null)
      t.true(handled)
      t.end()
    })
})

test.cb('Slapp.options() w/ regex criteria', t => {
  t.plan(3)

  let app = new Slapp({ context })
  let message = new Message('options', {
    name: 'my_name',
    callback_id: 'my_callback'
  }, meta)

  app
    .options('my_callback', /^my_n.*/, (msg) => {
      t.deepEqual(msg, message)
    })
    ._handle(message, (err, handled) => {
      t.is(err, null)
      t.true(handled)
      t.end()
    })
})

test.cb('Slapp.options() w/ url style callback criteria', t => {
  t.plan(4)

  let app = new Slapp({ context })
  let message = new Message('options', {
    callback_id: '/my_callback/1234'
  }, meta)

  app
    .options('/my_callback/:id', (msg, val) => {
      t.deepEqual(msg, message)
      t.is(msg.meta.params.id, '1234')
    })
    ._handle(message, (err, handled) => {
      t.is(err, null)
      t.true(handled)
      t.end()
    })
})

test.cb('Slapp.options() non matching criteria', t => {
  t.plan(4)

  let app = new Slapp({ context })
  let message = new Message('options', {
    callback_id: '/my_callback'
  }, meta)

  app
    .options('/your_callback', (msg, val) => {})
    ._handle(message, (err, handled) => {
      t.is(err, null)
      t.false(handled)
    })
    ._handle(new Message('', {}, meta), (err, handled) => {
      t.is(err, null)
      t.false(handled)
      t.end()
    })
})

test.cb('Slapp.dialog()', t => {
  t.plan(5)

  let app = new Slapp({ context })
  let submission = {
    question: 'answer',
    another: 'another'
  }
  let message = new Message('action', {
    type: 'dialog_submission',
    submission: submission,
    callback_id: '/dialog/12345'
  }, meta)

  app
    .dialog('/dialog/:id', (msg, theSubmission) => {
      t.deepEqual(msg, message)
      t.deepEqual(submission, theSubmission)
      t.is('12345', msg.meta.params.id)
    })
    ._handle(message, (err, handled) => {
      t.is(err, null)
      t.true(handled)
      t.end()
    })
})

test.cb('Slapp.dialog() no match', t => {
  t.plan(2)

  let app = new Slapp({ context })
  let message = new Message('action', {
    type: 'dialog_submission',
    submission: {},
    callback_id: '/xxxx/xxxx'
  }, meta)

  app
    .dialog('/dialog/:id', (msg, theSubmission) => {})
    ._handle(message, (err, handled) => {
      t.is(err, null)
      t.false(handled)
      t.end()
    })
})

test.cb('Slapp.dialog() not action, not dialog_submission', t => {
  t.plan(4)

  let app = new Slapp({ context })

  app
    .dialog('/dialog/:id', (msg, theSubmission) => { })
    ._handle(new Message('', {}, meta), (err, handled) => {
      t.is(err, null)
      t.false(handled)
    })
    ._handle(new Message('action', {}, meta), (err, handled) => {
      t.is(err, null)
      t.false(handled)
      t.end()
    })
})

test.cb('Slapp.dialogCancellation()', t => {
  t.plan(3)

  let app = new Slapp({ context })
  let message = new Message('action', {
    type: 'dialog_cancellation',
    callback_id: '/dialog/12345'
  }, meta)

  app
    .dialogCancellation('/dialog/12345', (msg) => {
      t.deepEqual(msg, message)
    })
    ._handle(message, (err, handled) => {
      t.is(err, null)
      t.true(handled)
      t.end()
    })
})

test.cb('Slapp.dialogCancellation() no match', t => {
  t.plan(2)

  let app = new Slapp({ context })
  let message = new Message('action', {
    type: 'dialog_cancellation',
    callback_id: '/xxxx/xxxx'
  }, meta)

  app
    .dialogCancellation('/dialog/:id', (msg) => {})
    ._handle(message, (err, handled) => {
      t.is(err, null)
      t.false(handled)
      t.end()
    })
})

test.cb('Slapp.dialogCancellation() not action, not dialog_submission', t => {
  t.plan(4)

  let app = new Slapp({ context })

  app
    .dialogCancellation('/dialog/12345', (msg) => { })
    ._handle(new Message('', {}, meta), (err, handled) => {
      t.is(err, null)
      t.false(handled)
    })
    ._handle(new Message('action', {}, meta), (err, handled) => {
      t.is(err, null)
      t.false(handled)
      t.end()
    })
})

test('Slapp default logger', t => {
  let app = new Slapp({ context })

  app.init()

  t.is(app.listenerCount('info'), 1)
  t.is(app.listenerCount('error'), 1)
})

test('Slapp custom logger', t => {
  const logger = (app) => {
    app
      .on('info', () => {})
      .on('error', () => {})
  }

  let app = new Slapp({
    logger,
    context
  })

  app.init()

  t.is(app.listenerCount('info'), 1)
  t.is(app.listenerCount('error'), 1)
})

test.cb('Slapp custom logger w/ a message', t => {
  t.plan(1)

  let app = new Slapp({
    logger: (app) => {
      app
        .on('info', (msg) => {
          t.true(true)
          t.end()
        })
    },
    context
  })

  app.init()

  let message = new Message('event', {
    event: {
      type: 'message',
      text: 'beep boop'
    }
  }, meta)

  app
    ._handle(message)
})

test.cb('Slapp custom logger w/ a bad message', t => {
  t.plan(1)

  let app = new Slapp({
    logger: (app) => {
      app
        .on('error', () => {
          t.true(true)
          t.end()
        })
    },
    context
  })

  app.init()

  let message = new Message('event', {}, {})

  app._handle(message)
})

// Test context fn
function context (req, res, next) {
  next()
}
