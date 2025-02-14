class CacheService {
    constructor() {
      this.cache = new Map();
      this.timestamps = new Map();
      this.TTL = 1000 * 60 * 15; // 15 minutos por defecto
    }
  
    set(key, value, ttl = this.TTL) {
      this.cache.set(key, value);
      this.timestamps.set(key, {
        created: Date.now(),
        ttl
      });
    }
  
    get(key) {
      if (!this.has(key)) return null;
  
      const timestamp = this.timestamps.get(key);
      if (Date.now() - timestamp.created > timestamp.ttl) {
        this.delete(key);
        return null;
      }
  
      return this.cache.get(key);
    }
  
    has(key) {
      return this.cache.has(key);
    }
  
    delete(key) {
      this.cache.delete(key);
      this.timestamps.delete(key);
    }
  
    clear() {
      this.cache.clear();
      this.timestamps.clear();
    }
  
    // Método para obtener todas las claves que coincidan con un patrón
    getKeysByPattern(pattern) {
      const regex = new RegExp(pattern);
      return Array.from(this.cache.keys()).filter(key => regex.test(key));
    }
  
    // Método para invalidar todas las claves que coincidan con un patrón
    invalidatePattern(pattern) {
      const keys = this.getKeysByPattern(pattern);
      keys.forEach(key => this.delete(key));
    }
  }
  
  module.exports = new CacheService();