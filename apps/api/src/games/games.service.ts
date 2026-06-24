import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateGameDto } from './dto/create-game.dto';
import { UpdateGameDto } from './dto/update-game.dto';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';

@Injectable()
export class GamesService {
  constructor(private prisma: PrismaService) {}

  // ── existing public methods (unchanged) ─────────────────────────────────

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

  // ── admin methods ────────────────────────────────────────────────────────

  adminListGames() {
    return this.prisma.game.findMany({ orderBy: { sortOrder: 'asc' } });
  }

  async adminCreateGame(dto: CreateGameDto) {
    const existing = await this.prisma.game.findUnique({ where: { slug: dto.slug } });
    if (existing) throw new ConflictException(`Slug "${dto.slug}" is already in use`);
    return this.prisma.game.create({ data: dto });
  }

  async adminUpdateGame(id: string, dto: UpdateGameDto) {
    const game = await this.prisma.game.findUnique({ where: { id } });
    if (!game) throw new NotFoundException('Game not found');

    if (dto.slug) {
      const slugConflict = await this.prisma.game.findFirst({
        where: { slug: dto.slug, NOT: { id } },
      });
      if (slugConflict) throw new ConflictException(`Slug "${dto.slug}" is already in use`);
    }

    return this.prisma.game.update({ where: { id }, data: dto });
  }

  async adminDeleteGame(id: string) {
    const game = await this.prisma.game.findUnique({ where: { id } });
    if (!game) throw new NotFoundException('Game not found');

    const hasOrders = await this.prisma.order.findFirst({
      where: { gameProduct: { gameId: id } },
      select: { id: true },
    });
    if (hasOrders) {
      throw new ConflictException('Cannot delete game: it has products with order history. Set isActive to false instead.');
    }

    await this.prisma.gameProduct.deleteMany({ where: { gameId: id } });
    await this.prisma.game.delete({ where: { id } });
  }

  adminListProducts(gameId: string) {
    return this.prisma.gameProduct.findMany({
      where: { gameId },
      orderBy: { sortOrder: 'asc' },
    });
  }

  async adminCreateProduct(gameId: string, dto: CreateProductDto) {
    const game = await this.prisma.game.findUnique({ where: { id: gameId } });
    if (!game) throw new NotFoundException('Game not found');

    const skuConflict = await this.prisma.gameProduct.findUnique({ where: { sku: dto.sku } });
    if (skuConflict) throw new ConflictException(`SKU "${dto.sku}" is already in use`);

    return this.prisma.gameProduct.create({ data: { ...dto, gameId } });
  }

  async adminUpdateProduct(id: string, dto: UpdateProductDto) {
    const product = await this.prisma.gameProduct.findUnique({ where: { id } });
    if (!product) throw new NotFoundException('Product not found');

    if (dto.sku) {
      const skuConflict = await this.prisma.gameProduct.findFirst({
        where: { sku: dto.sku, NOT: { id } },
      });
      if (skuConflict) throw new ConflictException(`SKU "${dto.sku}" is already in use`);
    }

    return this.prisma.gameProduct.update({ where: { id }, data: dto });
  }

  async adminDeleteProduct(id: string) {
    const product = await this.prisma.gameProduct.findUnique({ where: { id } });
    if (!product) throw new NotFoundException('Product not found');

    const hasOrders = await this.prisma.order.findFirst({
      where: { gameProductId: id },
      select: { id: true },
    });
    if (hasOrders) {
      throw new ConflictException('Cannot delete product: it has order history. Set isActive to false instead.');
    }

    await this.prisma.gameProduct.delete({ where: { id } });
  }
}
