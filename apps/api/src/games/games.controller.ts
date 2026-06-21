import { Controller, Get, Param } from '@nestjs/common';
import { GamesService } from './games.service';

@Controller('games')
export class GamesController {
  constructor(private games: GamesService) {}

  @Get()
  findAll() {
    return this.games.findAll();
  }

  @Get(':slug')
  findOne(@Param('slug') slug: string) {
    return this.games.findBySlug(slug);
  }

  @Get(':slug/products')
  findProducts(@Param('slug') slug: string) {
    return this.games.findProducts(slug);
  }
}
