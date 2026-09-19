/** Keep upstream HTTP routing while requiring Host credentials for Market routes. */
import WebServer, { type WebRoute } from '@deepseek-ai/dsh-host-webserver'
import type {} from '@deepseek-ai/dsh-client-connection'

export default class NextWebServer extends WebServer {
  static override Config = WebServer.Config

  override register(route: WebRoute): () => void {
    if (route.path !== '/api/community-market' && !route.path.startsWith('/api/community-market/')) return super.register(route)
    return super.register({ ...route, handler: async (request, response) => {
      const connection = this.ctx.get('connection')
      const rejection = connection === undefined ? 503 : connection.requestRejection(request)
      if (rejection !== undefined) {
        response.writeHead(rejection, { 'cache-control': 'no-store' })
        response.end('Market request authentication required')
        return
      }
      await route.handler(request, response)
    } })
  }
}
