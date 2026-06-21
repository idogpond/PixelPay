import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class GamesService {
  constructor(private prisma: PrismaService) {}

  findAll() {
    return this.prisma.game.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
      select: { id: true, name: true, slug: true, logoUrl: true, category: true, sortOrder: true },
    });
  }

  async findBySlug(slug: string) {
    const game = await this.prisma.game.findUnique({
      where: { slug },
      select: { id: true, name: true, slug: true, logoUrl: true, bannerUrl: true, description: true, category: true },
    });
    if (!game) throw new NotFoundException('Game not found');
    return game;
  }

  async findProducts(slug: string) {
    const game = await this.findBySlug(slug);
    return this.prisma.gameProduct.findMany({
      where: { gameId: game.id, isActive: true },
      orderBy: { sortOrder: 'asc' },
    });
  }
}
