import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { TicketStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { CreateTicketMessageDto } from './dto/create-ticket-message.dto';
import { UpdateTicketStatusDto } from './dto/update-ticket-status.dto';
import { FilterTicketsDto } from './dto/filter-tickets.dto';

const TICKET_WITH_MESSAGES = {
  include: {
    messages: {
      orderBy: { createdAt: 'asc' as const },
      include: {
        user: { select: { id: true, email: true, isAdmin: true } },
      },
    },
    user: { select: { id: true, email: true } },
  },
};

const TICKET_LIST_SELECT = {
  id: true,
  title: true,
  category: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  user: { select: { id: true, email: true } },
  messages: {
    orderBy: { createdAt: 'desc' as const },
    take: 1,
    select: { content: true, createdAt: true, isAdmin: true },
  },
};

@Injectable()
export class TicketsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, dto: CreateTicketDto) {
    return this.prisma.ticket.create({
      data: {
        title: dto.title,
        description: dto.description,
        category: dto.category,
        userId,
        messages: {
          create: {
            content: dto.description,
            userId,
            isAdmin: false,
          },
        },
      },
      ...TICKET_WITH_MESSAGES,
    });
  }

  async findAll(userId: string, filter: FilterTicketsDto) {
    return this.prisma.ticket.findMany({
      where: {
        userId,
        ...(filter.status ? { status: filter.status } : {}),
      },
      select: TICKET_LIST_SELECT,
      orderBy: { updatedAt: 'desc' },
    });
  }

  async findOne(userId: string, ticketId: string) {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id: ticketId },
      ...TICKET_WITH_MESSAGES,
    });
    if (!ticket) throw new NotFoundException('Chamado não encontrado.');
    if (ticket.userId !== userId) throw new ForbiddenException('Acesso negado.');
    return ticket;
  }

  async addMessage(userId: string, ticketId: string, dto: CreateTicketMessageDto, isAdmin: boolean) {
    const ticket = await this.prisma.ticket.findUnique({ where: { id: ticketId } });
    if (!ticket) throw new NotFoundException('Chamado não encontrado.');
    if (!isAdmin && ticket.userId !== userId) throw new ForbiddenException('Acesso negado.');
    if (ticket.status === TicketStatus.CLOSED) {
      throw new ForbiddenException('Chamado encerrado. Não é possível adicionar mensagens.');
    }

    const [message] = await this.prisma.$transaction([
      this.prisma.ticketMessage.create({
        data: { content: dto.content, ticketId, userId, isAdmin },
        include: { user: { select: { id: true, email: true, isAdmin: true } } },
      }),
      // If admin replies, move status to IN_PROGRESS automatically
      ...(isAdmin && ticket.status === TicketStatus.OPEN
        ? [
            this.prisma.ticket.update({
              where: { id: ticketId },
              data: { status: TicketStatus.IN_PROGRESS },
            }),
          ]
        : [
            this.prisma.ticket.update({
              where: { id: ticketId },
              data: { updatedAt: new Date() },
            }),
          ]),
    ]);

    return message;
  }

  // Admin methods
  async findAllAdmin(filter: FilterTicketsDto) {
    return this.prisma.ticket.findMany({
      where: filter.status ? { status: filter.status } : {},
      select: TICKET_LIST_SELECT,
      orderBy: { updatedAt: 'desc' },
    });
  }

  async findOneAdmin(ticketId: string) {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id: ticketId },
      ...TICKET_WITH_MESSAGES,
    });
    if (!ticket) throw new NotFoundException('Chamado não encontrado.');
    return ticket;
  }

  async updateStatus(ticketId: string, dto: UpdateTicketStatusDto) {
    const ticket = await this.prisma.ticket.findUnique({ where: { id: ticketId } });
    if (!ticket) throw new NotFoundException('Chamado não encontrado.');
    return this.prisma.ticket.update({
      where: { id: ticketId },
      data: { status: dto.status },
      ...TICKET_WITH_MESSAGES,
    });
  }
}
