import { PlayType, ValidationResult } from '../types/index.js';

export class GameLogic {
  /**
   * Converte resultado de dados em tipo de jogada
   * @param dice1 Primeiro dado (1-6)
   * @param dice2 Segundo dado (1-6)
   * @returns PlayType ou null se inválido
   */
  static parseRoll(dice1: number, dice2: number): PlayType | null {
    // Cricket: 1+2 ou 2+1
    if ((dice1 === 1 && dice2 === 2) || (dice1 === 2 && dice2 === 1)) {
      return PlayType.CRICKET;
    }

    // Pares
    if (dice1 === dice2) {
      const pairKey = `pair_${dice1}` as const;
      if (Object.values(PlayType).includes(pairKey as PlayType)) {
        return pairKey as PlayType;
      }
    }

    // Somas normais (4-11)
    const sum = dice1 + dice2;
    if (sum >= 4 && sum <= 11) {
      return `${sum}` as PlayType;
    }

    return null;
  }

  /**
   * Obtém a hierarquia numérica de uma jogada (maior = melhor)
   */
  static getPlayRank(playType: PlayType): number {
    const ranks: Record<PlayType, number> = {
      // Somas normais (4-11): 0-7
      [PlayType.NORMAL_4]: 0,
      [PlayType.NORMAL_5]: 1,
      [PlayType.NORMAL_6]: 2,
      [PlayType.NORMAL_7]: 3,
      [PlayType.NORMAL_8]: 4,
      [PlayType.NORMAL_9]: 5,
      [PlayType.NORMAL_10]: 6,
      [PlayType.NORMAL_11]: 7,
      // Pares (8-13)
      [PlayType.PAIR_1]: 8,
      [PlayType.PAIR_2]: 9,
      [PlayType.PAIR_3]: 10,
      [PlayType.PAIR_4]: 11,
      [PlayType.PAIR_5]: 12,
      [PlayType.PAIR_6]: 13,
      // Cricket (14): só perde para outro Cricket
      [PlayType.CRICKET]: 14,
    };

    return ranks[playType] ?? -1;
  }

  /**
   * Valida se um anúncio é maior que o anterior
   * Cricket só pode ser vencido por Cricket
   */
  static isValidAnnouncement(
    newAnnouncement: PlayType,
    previousAnnouncement: PlayType | null
  ): boolean {
    if (previousAnnouncement === null) {
      return true;
    }

    const newRank = this.getPlayRank(newAnnouncement);
    const prevRank = this.getPlayRank(previousAnnouncement);

    // Cricket só perde para outro Cricket
    if (previousAnnouncement === PlayType.CRICKET) {
      return newAnnouncement === PlayType.CRICKET;
    }

    return newRank > prevRank;
  }

  /**
   * Valida se um anúncio é verdadeiro baseado no resultado dos dados
   */
  static isAnnouncementTruth(
    announcement: PlayType,
    dice1: number,
    dice2: number
  ): boolean {
    const actualRoll = this.parseRoll(dice1, dice2);
    if (actualRoll === null) return false;

    const announcementRank = this.getPlayRank(announcement);
    const actualRank = this.getPlayRank(actualRoll);

    return actualRank >= announcementRank;
  }

  /**
   * Valida um anúncio (se é uma string válida de PlayType)
   */
  static parseAnnouncement(announcement: string): PlayType | null {
    if (Object.values(PlayType).includes(announcement as PlayType)) {
      return announcement as PlayType;
    }
    return null;
  }

  /**
   * Calcula o resultado de um desafio
   * @returns { winner, loser, livesLost, reason }
   */
  static resolveChallengeCallBluff(
    announcement: PlayType,
    actualDice1: number,
    actualDice2: number
  ): {
    loserLivesLost: number;
    wasTruth: boolean;
    reason: string;
  } {
    const wasTruth = this.isAnnouncementTruth(announcement, actualDice1, actualDice2);

    // Cricket: perde 2 vidas em ambos os casos
    if (announcement === PlayType.CRICKET) {
      return {
        loserLivesLost: 2,
        wasTruth,
        reason: wasTruth
          ? 'Cricket era verdade! Quem desmentiu perde 2 vidas'
          : 'Cricket era mentira! Quem mentiu perde 2 vidas',
      };
    }

    // Outras jogadas: perde 1 vida
    return {
      loserLivesLost: 1,
      wasTruth,
      reason: wasTruth
        ? 'O anúncio era verdade! Quem desmentiu perde 1 vida'
        : 'Era mentira! Quem mentiu perde 1 vida',
    };
  }

  /**
   * Formata uma jogada para exibição
   */
  static formatPlayType(playType: PlayType): string {
    const formats: Record<PlayType, string> = {
      [PlayType.NORMAL_4]: '4',
      [PlayType.NORMAL_5]: '5',
      [PlayType.NORMAL_6]: '6',
      [PlayType.NORMAL_7]: '7',
      [PlayType.NORMAL_8]: '8',
      [PlayType.NORMAL_9]: '9',
      [PlayType.NORMAL_10]: '10',
      [PlayType.NORMAL_11]: '11',
      [PlayType.PAIR_1]: 'Par de 1',
      [PlayType.PAIR_2]: 'Par de 2',
      [PlayType.PAIR_3]: 'Par de 3',
      [PlayType.PAIR_4]: 'Par de 4',
      [PlayType.PAIR_5]: 'Par de 5',
      [PlayType.PAIR_6]: 'Par de 6',
      [PlayType.CRICKET]: 'Cricket 🦗',
    };

    return formats[playType] ?? 'Jogada inválida';
  }

  /**
   * Valida um anúncio completo (string, deve ser maior que anterior)
   */
  static validateAnnouncement(
    announcementStr: string,
    previousAnnouncement: PlayType | null
  ): ValidationResult {
    const playType = this.parseAnnouncement(announcementStr);

    if (!playType) {
      return {
        isValid: false,
        message: `Anúncio inválido: ${announcementStr}. Use: 4-11, pair_1-pair_6, cricket`,
      };
    }

    if (!this.isValidAnnouncement(playType, previousAnnouncement)) {
      const formatted = this.formatPlayType(playType);
      const prevFormatted = previousAnnouncement
        ? this.formatPlayType(previousAnnouncement)
        : 'nada';
      return {
        isValid: false,
        message: `${formatted} não é maior que ${prevFormatted}`,
      };
    }

    return {
      isValid: true,
      playType,
      message: 'Anúncio válido',
    };
  }

  /**
   * Obtém lista de anúncios válidos dado um anúncio anterior
   */
  static getValidAnnouncementsAfter(previousAnnouncement: PlayType | null): PlayType[] {
    const allPlays = Object.values(PlayType);
    
    if (previousAnnouncement === null) {
      return allPlays as PlayType[];
    }

    const prevRank = this.getPlayRank(previousAnnouncement);

    // Cricket só pode ser seguido por Cricket
    if (previousAnnouncement === PlayType.CRICKET) {
      return [PlayType.CRICKET];
    }

    return allPlays.filter((play) => {
      const rank = this.getPlayRank(play as PlayType);
      return rank > prevRank;
    }) as PlayType[];
  }
}